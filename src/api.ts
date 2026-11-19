import { invoke } from "@tauri-apps/api/core";
import type { EntryDraft, EntryFull, EntrySummary } from "./types";

export const api = {
  dbStatus: () => invoke<{ exists: boolean; encrypted: boolean }>("db_status"),
  dbOpen: (password: string | null) => invoke("db_open", { password }),
  changePassword: (newPassword: string) =>
    invoke("change_password", { newPassword }),

  listEntries: () => invoke<EntrySummary[]>("entries_list"),
  getEntry: (id: number) => invoke<EntryFull>("entry_get", { id }),
  saveEntry: (draft: EntryDraft) => invoke<number>("entry_save", { draft }),
  deleteEntry: (id: number) => invoke("entry_delete", { id }),

  getAllSettings: () => invoke<Record<string, string>>("settings_get_all"),
  setSetting: (key: string, value: string) =>
    invoke("settings_set", { key, value }),

  importPhoto: (srcPath: string) => invoke<string>("import_photo", { srcPath }),
  importPhotoBytes: (ext: string, data: Uint8Array) =>
    invoke<string>("import_photo_bytes", { ext, data }),
  photoData: (filename: string) => invoke<string>("photo_data", { filename }),

  createBackup: (dest: string) => invoke<string>("create_backup", { dest }),
  restoreBackup: (src: string) => invoke("restore_backup", { src }),
  exportMarkdown: (dest: string) =>
    invoke<string>("export_markdown", { dest }),
  exportJson: (dest: string) => invoke<string>("export_json", { dest }),
  importJson: (src: string) => invoke<number>("import_json", { src }),
};
