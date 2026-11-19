use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::crypto;

pub struct Session {
    pub conn: Connection,
    /// Master key: Some when the journal is password-protected.
    pub master: Option<[u8; 32]>,
}

#[derive(Default)]
pub struct DbState(pub Mutex<Option<Session>>);

pub fn with_session<R>(
    state: &State<DbState>,
    f: impl FnOnce(&mut Session) -> Result<R, String>,
) -> Result<R, String> {
    let mut guard = state.0.lock().map_err(|_| "lock poisoned".to_string())?;
    let session = guard.as_mut().ok_or("Database is not open")?;
    f(session)
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn photos_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("photos");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("journal.sqlite"))
}

fn schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS entries(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            mood TEXT NOT NULL DEFAULT '',
            entry_date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tags(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS entry_tags(
            entry_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY(entry_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS photos(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL,
            filename TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())
}

fn meta_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .ok()
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- open / status / password ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub exists: bool,
    pub encrypted: bool,
}

#[tauri::command]
pub fn db_status(app: AppHandle) -> Result<DbStatus, String> {
    let path = db_path(&app)?;
    if !path.exists() {
        return Ok(DbStatus {
            exists: false,
            encrypted: false,
        });
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let encrypted = meta_get(&conn, "wrapped_master").is_some();
    Ok(DbStatus {
        exists: true,
        encrypted,
    })
}

#[tauri::command]
pub fn db_open(
    app: AppHandle,
    state: State<DbState>,
    password: Option<String>,
) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    schema(&conn)?;

    let master = match meta_get(&conn, "wrapped_master") {
        Some(wrapped) => {
            let pw = password.ok_or("This journal is password-protected")?;
            let salt = crypto::b64_decode(&meta_get(&conn, "kdf_salt").ok_or("Corrupted protection data")?)?;
            let kek = crypto::derive_kek(&pw, &salt)?;
            Some(crypto::unwrap_master(&kek, &wrapped)?)
        }
        None => None,
    };

    let mut guard = state.0.lock().map_err(|_| "lock poisoned".to_string())?;
    *guard = Some(Session { conn, master });
    Ok(())
}

fn encrypt_all_fields(conn: &Connection, master: &[u8; 32]) -> Result<(), String> {
    let rows: Vec<(i64, String, String, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, title, content, mood, entry_date FROM entries")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (id, title, content, mood, date) in rows {
        conn.execute(
            "UPDATE entries SET title=?1, content=?2, mood=?3, entry_date=?4 WHERE id=?5",
            rusqlite::params![
                crypto::encrypt_str(master, &title),
                crypto::encrypt_str(master, &content),
                crypto::encrypt_str(master, &mood),
                crypto::encrypt_str(master, &date),
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let tags: Vec<(i64, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, name FROM tags")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (id, name) in tags {
        conn.execute(
            "UPDATE tags SET name = ?1 WHERE id = ?2",
            rusqlite::params![crypto::encrypt_det(master, &name), id],
        )
        .map_err(|e| e.to_string())?;
    }
    encrypt_all_settings(conn, master)?;
    Ok(())
}

fn decrypt_all_fields(conn: &Connection, master: &[u8; 32]) -> Result<(), String> {
    let rows: Vec<(i64, String, String, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, title, content, mood, entry_date FROM entries")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (id, title, content, mood, date) in rows {
        conn.execute(
            "UPDATE entries SET title=?1, content=?2, mood=?3, entry_date=?4 WHERE id=?5",
            rusqlite::params![
                crypto::decrypt_str(Some(master), &title)?,
                crypto::decrypt_str(Some(master), &content)?,
                crypto::decrypt_str(Some(master), &mood)?,
                crypto::decrypt_str(Some(master), &date)?,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let tags: Vec<(i64, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, name FROM tags")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (id, name) in tags {
        conn.execute(
            "UPDATE tags SET name = ?1 WHERE id = ?2",
            rusqlite::params![crypto::decrypt_str(Some(master), &name)?, id],
        )
        .map_err(|e| e.to_string())?;
    }
    let settings: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (k, v) in settings {
        conn.execute(
            "UPDATE settings SET value = ?1 WHERE key = ?2",
            rusqlite::params![crypto::decrypt_str(Some(master), &v)?, k],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn encrypt_all_settings(conn: &Connection, master: &[u8; 32]) -> Result<(), String> {
    let settings: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for (k, v) in settings {
        conn.execute(
            "UPDATE settings SET value = ?1 WHERE key = ?2",
            rusqlite::params![crypto::encrypt_str(master, &v), k],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn recode_all_photos(app: &AppHandle, master: &[u8; 32], encrypt: bool) -> Result<(), String> {
    let pdir = photos_dir(app)?;
    if let Ok(list) = fs::read_dir(&pdir) {
        for item in list.flatten() {
            let p = item.path();
            if !p.is_file() {
                continue;
            }
            let bytes = fs::read(&p).map_err(|e| e.to_string())?;
            let out = if encrypt {
                crypto::encrypt_bytes(master, &bytes)?
            } else {
                crypto::decrypt_bytes(master, &bytes)?
            };
            fs::write(&p, out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Sets, changes, or removes (empty string) the journal password.
#[tauri::command]
pub fn change_password(
    app: AppHandle,
    state: State<DbState>,
    new_password: String,
) -> Result<(), String> {
    with_session(&state, |s| {
        if new_password.is_empty() {
            if let Some(master) = s.master {
                decrypt_all_fields(&s.conn, &master)?;
                recode_all_photos(&app, &master, false)?;
                s.conn
                    .execute_batch(
                        "DELETE FROM meta WHERE key IN ('wrapped_master','kdf_salt');",
                    )
                    .map_err(|e| e.to_string())?;
                s.master = None;
            }
            return Ok(());
        }
        if s.master.is_none() {
            let master = crypto::random::<32>();
            encrypt_all_fields(&s.conn, &master)?;
            recode_all_photos(&app, &master, true)?;
            s.master = Some(master);
        }
        let master = s.master.unwrap();
        let salt = crypto::random::<16>();
        let kek = crypto::derive_kek(&new_password, &salt)?;
        let wrapped = crypto::wrap_master(&kek, &master)?;
        meta_set(&s.conn, "kdf_salt", &crypto::b64_encode(&salt))?;
        meta_set(&s.conn, "wrapped_master", &wrapped)?;
        Ok(())
    })
}

// ---------- entries ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntrySummary {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub mood: String,
    pub entry_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntryFull {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub mood: String,
    pub entry_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub photos: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDraft {
    pub id: Option<i64>,
    pub title: String,
    pub content: String,
    pub mood: String,
    pub entry_date: String,
    pub tags: Vec<String>,
    pub photos: Vec<String>,
}

pub(crate) fn enc(s: &Session, plain: &str) -> String {
    match s.master {
        Some(m) => crypto::encrypt_str(&m, plain),
        None => plain.to_string(),
    }
}

/// Tag names use deterministic encryption so the UNIQUE constraint
/// still deduplicates identical tags.
pub(crate) fn enc_tag(s: &Session, plain: &str) -> String {
    match s.master {
        Some(m) => crypto::encrypt_det(&m, plain),
        None => plain.to_string(),
    }
}

pub(crate) fn dec(s: &Session, stored: &str) -> Result<String, String> {
    crypto::decrypt_str(s.master.as_ref(), stored)
}

#[tauri::command]
pub fn entries_list(state: State<DbState>) -> Result<Vec<EntrySummary>, String> {
    with_session(&state, |s| {
        let mut stmt = s
            .conn
            .prepare(
                "SELECT e.id, e.title, e.content, e.mood, e.entry_date, e.created_at, e.updated_at,
                    (SELECT group_concat(t.name, ',') FROM tags t
                     JOIN entry_tags et ON et.tag_id = t.id WHERE et.entry_id = e.id)
                 FROM entries e",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, Option<String>>(7)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            let (id, title, content, mood, date, created, updated, tags) =
                row.map_err(|e| e.to_string())?;
            // Tag names are encrypted individually, so decode each one.
            let tags_plain: Vec<String> = tags
                .split(',')
                .filter(|t| !t.is_empty())
                .map(|t| dec(s, t))
                .collect::<Result<_, _>>()?;
            out.push(EntrySummary {
                id,
                title: dec(s, &title)?,
                content: dec(s, &content)?,
                mood: dec(s, &mood)?,
                entry_date: dec(s, &date)?,
                created_at: created,
                updated_at: updated,
                tags: tags_plain.join(","),
            });
        }
        drop(stmt);
        out.sort_by(|a, b| {
            b.entry_date
                .cmp(&a.entry_date)
                .then(b.created_at.cmp(&a.created_at))
        });
        Ok(out)
    })
}

#[tauri::command]
pub fn entry_get(state: State<DbState>, id: i64) -> Result<EntryFull, String> {
    with_session(&state, |s| {
        let (title, content, mood, entry_date, created_at, updated_at) = s
            .conn
            .query_row(
                "SELECT title, content, mood, entry_date, created_at, updated_at FROM entries WHERE id = ?1",
                [id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                    ))
                },
            )
            .map_err(|_| format!("Entry {id} not found"))?;
        let mut stmt = s
            .conn
            .prepare(
                "SELECT t.name FROM tags t JOIN entry_tags et ON et.tag_id = t.id WHERE et.entry_id = ?1 ORDER BY t.name",
            )
            .map_err(|e| e.to_string())?;
        let raw_tags: Vec<String> = stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        let mut tags = Vec::new();
        for t in raw_tags {
            tags.push(dec(s, &t)?);
        }
        let mut stmt = s
            .conn
            .prepare("SELECT filename FROM photos WHERE entry_id = ?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let photos: Vec<String> = stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(EntryFull {
            id,
            title: dec(s, &title)?,
            content: dec(s, &content)?,
            mood: dec(s, &mood)?,
            entry_date: dec(s, &entry_date)?,
            created_at,
            updated_at,
            tags,
            photos,
        })
    })
}

#[tauri::command]
pub fn entry_save(
    app: AppHandle,
    state: State<DbState>,
    draft: EntryDraft,
) -> Result<i64, String> {
    let now = chrono::Local::now().to_rfc3339();
    with_session(&state, |s| {
        let tx = s.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let id = match draft.id {
            Some(id) => {
                tx.execute(
                    "UPDATE entries SET title=?1, content=?2, mood=?3, entry_date=?4, updated_at=?5 WHERE id=?6",
                    rusqlite::params![
                        enc(s, &draft.title),
                        enc(s, &draft.content),
                        enc(s, &draft.mood),
                        enc(s, &draft.entry_date),
                        now,
                        id
                    ],
                )
                .map_err(|e| e.to_string())?;
                id
            }
            None => {
                tx.execute(
                    "INSERT INTO entries(title, content, mood, entry_date, created_at, updated_at) VALUES(?1,?2,?3,?4,?5,?5)",
                    rusqlite::params![
                        enc(s, &draft.title),
                        enc(s, &draft.content),
                        enc(s, &draft.mood),
                        enc(s, &draft.entry_date),
                        now
                    ],
                )
                .map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            }
        };
        tx.execute("DELETE FROM entry_tags WHERE entry_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        for name in &draft.tags {
            let name = name.trim();
            if name.is_empty() {
                continue;
            }
            let enc_name = enc_tag(s, name);
            tx.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", [&enc_name])
                .map_err(|e| e.to_string())?;
            let tag_id: i64 = tx
                .query_row("SELECT id FROM tags WHERE name = ?1", [&enc_name], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES(?1, ?2)",
                rusqlite::params![id, tag_id],
            )
            .map_err(|e| e.to_string())?;
        }
        // sync photos: delete files no longer referenced, then rewrite rows
        let mut stmt = tx
            .prepare("SELECT filename FROM photos WHERE entry_id = ?1")
            .map_err(|e| e.to_string())?;
        let old: Vec<String> = stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        if let Ok(pdir) = photos_dir(&app) {
            for f in old.iter().filter(|f| !draft.photos.contains(f)) {
                let _ = fs::remove_file(pdir.join(f));
            }
        }
        tx.execute("DELETE FROM photos WHERE entry_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        for f in &draft.photos {
            tx.execute(
                "INSERT INTO photos(entry_id, filename) VALUES(?1, ?2)",
                rusqlite::params![id, f],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    })
}

#[tauri::command]
pub fn entry_delete(app: AppHandle, state: State<DbState>, id: i64) -> Result<(), String> {
    with_session(&state, |s| {
        let mut stmt = s
            .conn
            .prepare("SELECT filename FROM photos WHERE entry_id = ?1")
            .map_err(|e| e.to_string())?;
        let files: Vec<String> = stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        if let Ok(pdir) = photos_dir(&app) {
            for f in files {
                let _ = fs::remove_file(pdir.join(f));
            }
        }
        s.conn
            .execute("DELETE FROM entry_tags WHERE entry_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        s.conn
            .execute("DELETE FROM photos WHERE entry_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        s.conn
            .execute("DELETE FROM entries WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// ---------- settings ----------

/// All entries with tags and photo filenames, oldest first. Used by exports.
pub fn all_entries_full(state: &State<DbState>) -> Result<Vec<EntryFull>, String> {
    let ids: Vec<i64> = with_session(state, |s| {
        let mut stmt = s
            .conn
            .prepare("SELECT id FROM entries ORDER BY created_at ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })?;
    let mut out = Vec::new();
    for id in ids {
        out.push(entry_get(state.clone(), id)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn settings_get_all(state: State<DbState>) -> Result<HashMap<String, String>, String> {
    with_session(&state, |s| {
        let mut stmt = s
            .conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut map = HashMap::new();
        for row in rows {
            let (k, v) = row.map_err(|e| e.to_string())?;
            map.insert(k, dec(s, &v)?);
        }
        Ok(map)
    })
}

#[tauri::command]
pub fn settings_set(state: State<DbState>, key: String, value: String) -> Result<(), String> {
    with_session(&state, |s| {
        let stored = enc(s, &value);
        s.conn
            .execute(
                "INSERT INTO settings(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![key, stored],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// ---------- photos ----------

const IMAGE_EXTS: [&str; 7] = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "image/jpeg",
    }
}

/// Copies an image into the journal's photo store, encrypting it at rest
/// when the journal is password-protected. Returns the stored filename.
#[tauri::command]
pub fn import_photo(app: AppHandle, state: State<DbState>, src_path: String) -> Result<String, String> {
    let src = Path::new(&src_path);
    if !src.is_file() {
        return Err("File not found".into());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Unsupported image type".into());
    }
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = photos_dir(&app)?.join(&name);
    let bytes = fs::read(src).map_err(|e| format!("Could not read image: {e}"))?;
    let stored = with_session(&state, |s| -> Result<Vec<u8>, String> {
        match s.master {
            Some(m) => crypto::encrypt_bytes(&m, &bytes),
            None => Ok(bytes.clone()),
        }
    })?;
    fs::write(&dest, stored).map_err(|e| format!("Could not save image: {e}"))?;
    Ok(name)
}

/// Imports an image from raw bytes (drag & drop / paste), encrypting it at
/// rest when the journal is password-protected. Returns the stored filename.
#[tauri::command]
pub fn import_photo_bytes(app: AppHandle, state: State<DbState>, ext: String, data: Vec<u8>) -> Result<String, String> {
    let ext = ext.to_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Unsupported image type".into());
    }
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = photos_dir(&app)?.join(&name);
    let stored = with_session(&state, |s| -> Result<Vec<u8>, String> {
        match s.master {
            Some(m) => crypto::encrypt_bytes(&m, &data),
            None => Ok(data.clone()),
        }
    })?;
    fs::write(&dest, stored).map_err(|e| format!("Could not save image: {e}"))?;
    Ok(name)
}

/// Returns the (decrypted) photo as a data URL for display in the app.
#[tauri::command]
pub fn photo_data(app: AppHandle, state: State<DbState>, filename: String) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".into());
    }
    let path = photos_dir(&app)?.join(&filename);
    let bytes = fs::read(&path).map_err(|_| "Photo not found".to_string())?;
    let plain = with_session(&state, |s| -> Result<Vec<u8>, String> {
        match s.master {
            Some(m) => crypto::decrypt_bytes(&m, &bytes),
            None => Ok(bytes.clone()),
        }
    })?;
    let ext = filename.rsplit('.').next().unwrap_or("jpg").to_lowercase();
    Ok(format!(
        "data:{};base64,{}",
        mime_for(&ext),
        crypto::b64_encode(&plain)
    ))
}
