use crate::db::{data_dir, db_path, photos_dir, with_session, DbState, EntryFull};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, State};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

fn sql_str(s: &str) -> String {
    s.replace('\'', "''")
}

/// One-click backup: consistent snapshot of the database plus photos,
/// packed into a single `.journal` zip file the user can copy anywhere.
/// When the journal is password-protected, the backup stays encrypted.
#[tauri::command]
pub fn create_backup(app: AppHandle, state: State<DbState>, dest: String) -> Result<String, String> {
    let data = data_dir(&app)?;
    let snapshot = data.join(format!("snapshot-{}.sqlite", uuid::Uuid::new_v4()));

    with_session(&state, |s| {
        s.conn
            .execute_batch(&format!(
                "VACUUM INTO '{}';",
                sql_str(&snapshot.to_string_lossy())
            ))
            .map_err(|e| format!("Could not snapshot database: {e}"))
    })?;

    let result = (|| -> Result<(), String> {
        let out = File::create(&dest).map_err(|e| format!("Could not create backup file: {e}"))?;
        let mut zipw = ZipWriter::new(out);
        let opts: SimpleFileOptions =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zipw.start_file("journal.sqlite", opts)
            .map_err(|e| e.to_string())?;
        let bytes = fs::read(&snapshot).map_err(|e| e.to_string())?;
        zipw.write_all(&bytes).map_err(|e| e.to_string())?;

        let pdir = photos_dir(&app)?;
        if let Ok(list) = fs::read_dir(&pdir) {
            for item in list.flatten() {
                let p = item.path();
                if p.is_file() {
                    let name = format!("photos/{}", p.file_name().unwrap().to_string_lossy());
                    zipw.start_file(name, opts).map_err(|e| e.to_string())?;
                    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
                    zipw.write_all(&bytes).map_err(|e| e.to_string())?;
                }
            }
        }
        zipw.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();

    let _ = fs::remove_file(&snapshot);
    result?;
    Ok(dest)
}

#[tauri::command]
pub fn restore_backup(app: AppHandle, state: State<DbState>, src: String) -> Result<(), String> {
    let file = File::open(&src).map_err(|e| format!("Could not open backup file: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Not a valid backup: {e}"))?;

    let has_db = (0..archive.len()).any(|i| {
        archive
            .by_index(i)
            .map(|f| f.name() == "journal.sqlite")
            .unwrap_or(false)
    });
    if !has_db {
        return Err("This file does not contain a journal database".into());
    }

    // Release the current database so files can be replaced on Windows.
    {
        let mut guard = state.0.lock().map_err(|_| "lock poisoned".to_string())?;
        *guard = None;
    }

    let data = data_dir(&app)?;
    let pdir = photos_dir(&app)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue, // unsafe path inside zip, skip
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let target = if rel_str == "journal.sqlite" {
            db_path(&app)?
        } else if let Some(name) = rel_str.strip_prefix("photos/") {
            if name.is_empty() || name.contains('/') {
                continue;
            }
            pdir.join(name)
        } else {
            continue;
        };
        if rel_str == "journal.sqlite" {
            // Remove stale WAL files so the restored db opens cleanly.
            let _ = fs::remove_file(data.join("journal.sqlite-wal"));
            let _ = fs::remove_file(data.join("journal.sqlite-shm"));
        }
        let mut out = File::create(&target).map_err(|e| format!("Could not write file: {e}"))?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- exports ----------

#[tauri::command]
pub fn export_markdown(state: State<DbState>, dest: String) -> Result<String, String> {
    let entries = crate::db::all_entries_full(&state)?;
    let mut md = String::from("# My Journal\n\n");
    for e in entries.iter().rev() {
        let title = if e.title.trim().is_empty() {
            "Untitled".to_string()
        } else {
            e.title.clone()
        };
        md.push_str(&format!("## {title}\n\n"));
        let mut meta = format!("*{}", e.entry_date);
        if !e.mood.is_empty() {
            meta.push_str(&format!(" · {}", e.mood));
        }
        if !e.tags.is_empty() {
            meta.push_str(&format!(" · {}", e.tags.join(", ")));
        }
        meta.push_str("*\n\n");
        md.push_str(&meta);
        md.push_str(e.content.trim());
        md.push_str("\n\n---\n\n");
    }
    fs::write(&dest, md).map_err(|e| format!("Could not write file: {e}"))?;
    Ok(dest)
}

#[tauri::command]
pub fn export_json(state: State<DbState>, dest: String) -> Result<String, String> {
    let entries = crate::db::all_entries_full(&state)?;
    let payload = serde_json::json!({
        "app": "serene-journal",
        "version": 1,
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "entries": entries,
    });
    let text = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&dest, text).map_err(|e| format!("Could not write file: {e}"))?;
    Ok(dest)
}

/// Import entries from a previously exported JSON file.
/// Entries whose created_at already exists are skipped, so importing twice is safe.
#[tauri::command]
pub fn import_json(state: State<DbState>, src: String) -> Result<u32, String> {
    let text = fs::read_to_string(Path::new(&src)).map_err(|e| format!("Could not read file: {e}"))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "Not a valid JSON export".to_string())?;
    let entries: Vec<EntryFull> = serde_json::from_value(
        parsed
            .get("entries")
            .cloned()
            .ok_or("No entries found in file".to_string())?,
    )
    .map_err(|_| "Unexpected JSON format".to_string())?;

    with_session(&state, |s| {
        let tx = s.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let mut imported = 0u32;
        for e in entries {
            let dup: i64 = tx
                .query_row(
                    "SELECT count(*) FROM entries WHERE created_at = ?1",
                    [&e.created_at],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if dup > 0 {
                continue;
            }
            tx.execute(
                "INSERT INTO entries(title, content, mood, entry_date, created_at, updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
                rusqlite::params![
                    crate::db::enc(s, &e.title),
                    crate::db::enc(s, &e.content),
                    crate::db::enc(s, &e.mood),
                    crate::db::enc(s, &e.entry_date),
                    e.created_at,
                    e.updated_at
                ],
            )
            .map_err(|err| err.to_string())?;
            let id = tx.last_insert_rowid();
            for name in &e.tags {
                let enc_name = crate::db::enc_tag(s, name);
                tx.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", [&enc_name])
                    .map_err(|err| err.to_string())?;
                let tag_id: i64 = tx
                    .query_row("SELECT id FROM tags WHERE name = ?1", [&enc_name], |r| r.get(0))
                    .map_err(|err| err.to_string())?;
                tx.execute(
                    "INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES(?1, ?2)",
                    rusqlite::params![id, tag_id],
                )
                .map_err(|err| err.to_string())?;
            }
            imported += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(imported)
    })
}
