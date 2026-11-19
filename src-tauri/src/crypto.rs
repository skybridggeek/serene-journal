use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};

const PREFIX: &str = "enc1:";

pub fn random<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    OsRng.fill_bytes(&mut b);
    b
}

pub fn b64_encode(data: &[u8]) -> String {
    STANDARD.encode(data)
}

pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    STANDARD.decode(s).map_err(|e| e.to_string())
}

/// Derive a 32-byte key-encryption-key from the user's password.
pub fn derive_kek(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default())
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn wrap_master(kek: &[u8; 32], master: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(kek).map_err(|e| e.to_string())?;
    let nonce = random::<12>();
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), master.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(b64_encode(&[nonce.as_slice(), &ct].concat()))
}

/// Fails with "Wrong password" when the password doesn't match.
pub fn unwrap_master(kek: &[u8; 32], wrapped_b64: &str) -> Result<[u8; 32], String> {
    let raw = b64_decode(wrapped_b64)?;
    if raw.len() < 13 {
        return Err("Wrong password".into());
    }
    let (nonce, ct) = raw.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(kek).map_err(|e| e.to_string())?;
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "Wrong password".to_string())?;
    if pt.len() != 32 {
        return Err("Wrong password".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&pt);
    Ok(key)
}

pub fn encrypt_bytes(master: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(master).map_err(|e| e.to_string())?;
    let nonce = random::<12>();
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), data)
        .map_err(|e| e.to_string())?;
    Ok([nonce.as_slice(), &ct].concat())
}

pub fn decrypt_bytes(master: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 13 {
        return Err("Could not decrypt data".into());
    }
    let (nonce, ct) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(master).map_err(|e| e.to_string())?;
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| "Could not decrypt data".to_string())
}

/// Encrypts a text field. Already-encrypted values pass through unchanged,
/// so re-encrypting the whole table twice is safe.
pub fn encrypt_str(master: &[u8; 32], plain: &str) -> String {
    if plain.starts_with(PREFIX) {
        return plain.to_string();
    }
    match encrypt_bytes(master, plain.as_bytes()) {
        Ok(b) => format!("{PREFIX}{}", b64_encode(&b)),
        Err(_) => plain.to_string(),
    }
}

/// Deterministic encryption (nonce derived from key + plaintext) so that
/// identical values — e.g. tag names — produce identical ciphertext and can
/// still be deduplicated by a UNIQUE constraint.
pub fn encrypt_det(master: &[u8; 32], plain: &str) -> String {
    use sha2::{Digest, Sha256};
    if plain.starts_with(PREFIX) {
        return plain.to_string();
    }
    let mut h = Sha256::new();
    h.update(master);
    h.update(plain.as_bytes());
    let hash = h.finalize();
    let nonce: [u8; 12] = hash[..12].try_into().expect("sha256 is 32 bytes");
    let cipher = match Aes256Gcm::new_from_slice(master) {
        Ok(c) => c,
        Err(_) => return plain.to_string(),
    };
    match cipher.encrypt(Nonce::from_slice(&nonce), plain.as_bytes()) {
        Ok(ct) => format!("{PREFIX}{}", b64_encode(&[nonce.as_slice(), &ct].concat())),
        Err(_) => plain.to_string(),
    }
}

/// Decrypts a stored text field. Plain (unprotected) values pass through,
/// which lets protected and unprotected modes share the same storage.
pub fn decrypt_str(master: Option<&[u8; 32]>, stored: &str) -> Result<String, String> {
    if !stored.starts_with(PREFIX) {
        return Ok(stored.to_string());
    }
    let m = master.ok_or("Password required to read this data")?;
    let raw = b64_decode(&stored[PREFIX.len()..])?;
    let pt = decrypt_bytes(m, &raw)?;
    String::from_utf8(pt).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_text() {
        let master = random::<32>();
        let stored = encrypt_str(&master, "hello journal 🌙");
        assert!(stored.starts_with(PREFIX));
        assert_eq!(decrypt_str(Some(&master), &stored).unwrap(), "hello journal 🌙");
    }

    #[test]
    fn plaintext_passthrough() {
        assert_eq!(decrypt_str(None, "plain text").unwrap(), "plain text");
        assert_eq!(decrypt_str(Some(&random::<32>()), "plain text").unwrap(), "plain text");
    }

    #[test]
    fn wrong_master_fails() {
        let m1 = random::<32>();
        let m2 = random::<32>();
        let stored = encrypt_str(&m1, "secret");
        assert!(decrypt_str(Some(&m2), &stored).is_err());
    }

    #[test]
    fn deterministic_tags_dedupe() {
        let master = random::<32>();
        assert_eq!(encrypt_det(&master, "University"), encrypt_det(&master, "University"));
        assert_ne!(encrypt_det(&master, "University"), encrypt_det(&master, "Work"));
        // still decryptable
        assert_eq!(
            decrypt_str(Some(&master), &encrypt_det(&master, "Ideas")).unwrap(),
            "Ideas"
        );
    }

    #[test]
    fn password_wrap_unwrap() {
        let master = random::<32>();
        let salt = random::<16>();
        let kek = derive_kek("hunter2", &salt).unwrap();
        let wrapped = wrap_master(&kek, &master).unwrap();
        assert_eq!(unwrap_master(&kek, &wrapped).unwrap(), master);
        // wrong password must fail
        let bad = derive_kek("hunter3", &salt).unwrap();
        assert!(unwrap_master(&bad, &wrapped).is_err());
    }

    #[test]
    fn bytes_roundtrip() {
        let master = random::<32>();
        let data = vec![1u8, 2, 3, 250, 251];
        let enc = encrypt_bytes(&master, &data).unwrap();
        assert_eq!(decrypt_bytes(&master, &enc).unwrap(), data);
    }
}
