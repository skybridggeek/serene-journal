# Serene Journal 🪶

A calm, private journaling app for Windows. Everything stays on your computer —
no account, no server, no internet needed after installation.

## Daily use

- **Open the app and start writing.** The big button on the home screen opens
  today's entry (or creates it).
- Entries save automatically as you type — you can close the window anytime.
- Pick a mood, add tags (University / Work / Personal / Ideas or your own),
  and attach photos if you like.
- **Calendar** shows every day you wrote; **Insights** shows gentle patterns
  (streaks, moods, word counts).

## Make it yours (no coding needed)

Settings → Appearance:

| Setting  | Options |
|----------|---------|
| Theme    | Midnight · Warm Dark · Light · Sepia · Custom (color pickers) |
| Font     | Inter · Poppins · Merriweather · Lora · System |
| Text size | Small · Medium · Large |
| Density  | Compact · Comfortable |
| Accent   | Any color you like |

All fonts are bundled — they work offline. Changes apply instantly.

## Your data

Stored only on this PC, in:
`C:\Users\<you>\AppData\Roaming\com.mehdi.serene-journal\`
(`journal.sqlite` database + `photos\` folder).

Settings → Data gives you:

- **Create Backup** — one `MyJournal-<date>.journal` file containing everything
  (database + photos). Copy it to a USB stick or external disk regularly.
- **Restore Backup** — replaces the current journal with a backup file.
- **Export as Markdown / JSON** — readable copies of your entries.
- **Import Journal (JSON)** — merges a JSON export back in (duplicates skipped).
- **Export as PDF** — opens the print dialog; choose “Save as PDF”.

## Security

Settings → Security lets you set a password. Your entries, moods, tags,
settings and photos are then encrypted (AES-256) on disk — copying the database
file won't reveal anything.

> ⚠️ If you forget the password, the entries cannot be recovered.
> Keep a backup file in a safe place.

## Development (for maintainers)

Stack: **Tauri 2 + React + TypeScript + Vite + SQLite (rusqlite)**, with
app-level AES-256-GCM encryption (RustCrypto) and Argon2id key derivation.

```bash
npm install        # once
npm run tauri dev  # run in development
npm run tauri build # produce Windows installer (.msi/.exe) in src-tauri/target/release/bundle
```

Project layout:

```
src/                 React frontend
├── pages/           Home, Editor, JournalList, CalendarPage, Insights, SettingsPage
├── components/      Lock screen, shared cards/icons
├── theme.ts         Applies settings → CSS variables (the whole design system)
├── styles.css       All tokens + components (themes are data, not code)
├── api.ts           Typed wrappers around Tauri commands
└── stats.ts         Streaks & aggregation helpers

src-tauri/src/       Rust backend
├── db.rs            SQLite schema, entries/tags/settings/photos, password
├── crypto.rs        AES-256-GCM field & photo encryption, Argon2id KDF
└── backup.rs        .journal backup/restore, Markdown/JSON export & import

scripts/fetch-fonts.mjs  Re-downloads bundled Google Fonts (offline use)
```

Design rule: **components only use CSS variables** (`--bg`, `--surface`,
`--text`, `--text-2`, `--accent`, `--border`, `--editor-bg`). To add a theme,
add a `[data-theme="..."]` block in `styles.css` — never hard-code colors.
