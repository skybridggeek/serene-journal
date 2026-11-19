import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Shared";
import { QUOTE_CATEGORIES } from "../quotes";
import { FONTS, type EntrySummary, type Settings, type ThemeKey } from "../types";

const THEMES: { key: ThemeKey; name: string; colors: string[] }[] = [
  { key: "midnight", name: "Midnight", colors: ["#0f1219", "#161b26", "#8b7cf6"] },
  { key: "warm-dark", name: "Warm Dark", colors: ["#16120e", "#201a13", "#c89b6d"] },
  { key: "light", name: "Light", colors: ["#f5f2ec", "#fffdf8", "#b0794a"] },
  { key: "sepia", name: "Sepia", colors: ["#ead9bc", "#f4e9d2", "#9c6b3c"] },
];

const dateStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function SettingsPage({
  settings,
  updateSettings,
  entries,
  onRestored,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  entries: EntrySummary[];
  onRestored: () => Promise<void>;
}) {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const selectedFont = FONTS.find((f) => f.key === settings.font) ?? FONTS[3];

  async function run(name: string, fn: () => Promise<string | void>) {
    setBusy(name);
    setMsg(null);
    try {
      const result = await fn();
      if (result !== null && result !== undefined && result !== "") {
        setMsg({ text: result });
      }
    } catch (e) {
      setMsg({ text: String(e), error: true });
    } finally {
      setBusy("");
    }
  }

  async function backup() {
    const dest = await save({
      defaultPath: `MyJournal-${dateStamp()}.journal`,
      filters: [{ name: "Journal backup", extensions: ["journal"] }],
    });
    if (!dest) return "";
    await api.createBackup(dest);
    return `Backup saved to ${dest}`;
  }

  async function restore() {
    const src = await open({
      filters: [{ name: "Journal backup", extensions: ["journal"] }],
      multiple: false,
    });
    if (!src || typeof src !== "string") return "";
    await api.restoreBackup(src);
    await onRestored();
    return "Journal restored from backup.";
  }

  async function exportMd() {
    const dest = await save({
      defaultPath: `MyJournal-${dateStamp()}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!dest) return "";
    await api.exportMarkdown(dest);
    return `Markdown exported to ${dest}`;
  }

  async function exportJson() {
    const dest = await save({
      defaultPath: `MyJournal-${dateStamp()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!dest) return "";
    await api.exportJson(dest);
    return `JSON exported to ${dest}`;
  }

  async function importJson() {
    const src = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!src || typeof src !== "string") return "";
    const n = await api.importJson(src);
    return `Imported ${n} new ${n === 1 ? "entry" : "entries"} (duplicates skipped).`;
  }

  async function savePassword() {
    if (pw.length > 0 && pw.length < 4) {
      setPwMsg("Password must be at least 4 characters.");
      return;
    }
    if (pw !== pw2) {
      setPwMsg("Passwords don't match.");
      return;
    }
    try {
      await api.changePassword(pw);
      setPw("");
      setPw2("");
      setPwMsg(
        pw === ""
          ? "Password removed. Your journal is no longer encrypted."
          : "Password saved. You'll be asked for it the next time the app starts."
      );
    } catch (e) {
      setPwMsg(`Could not update password: ${e}`);
    }
  }

  return (
    <div className="content">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Make the journal feel like yours.</p>

      {/* ---------- Profile ---------- */}
      <section className="settings-section">
        <h2>Profile</h2>
        <p className="sub">Used only for your greeting. Stored on this device.</p>
        <input
          className="input"
          style={{ maxWidth: 340 }}
          placeholder="Your name"
          value={settings.userName}
          onChange={(e) => updateSettings({ userName: e.target.value })}
        />
      </section>

      {/* ---------- Appearance ---------- */}
      <section className="settings-section">
        <h2>Appearance</h2>
        <p className="sub">Changes apply instantly, everywhere.</p>

        <span className="setting-label">{Icon.Palette} Theme</span>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={`theme-card ${settings.theme === t.key ? "active" : ""}`}
              onClick={() => updateSettings({ theme: t.key })}
            >
              <div className="theme-swatch">
                {t.colors.map((c) => (
                  <div key={c} style={{ background: c }} />
                ))}
              </div>
              <div className="theme-name">{t.name}</div>
            </button>
          ))}
          <button
            className={`theme-card ${settings.theme === "custom" ? "active" : ""}`}
            onClick={() => updateSettings({ theme: "custom" })}
          >
            <div className="theme-swatch">
              <div style={{ background: settings.customBg }} />
              <div style={{ background: settings.customSurface }} />
              <div style={{ background: settings.accentColor || "#c89b6d" }} />
            </div>
            <div className="theme-name">Custom</div>
          </button>
        </div>

        {settings.theme === "custom" && (
          <div className="color-row">
            <label className="color-field">
              Background
              <input
                type="color"
                value={settings.customBg}
                onChange={(e) => updateSettings({ customBg: e.target.value })}
              />
            </label>
            <label className="color-field">
              Cards
              <input
                type="color"
                value={settings.customSurface}
                onChange={(e) => updateSettings({ customSurface: e.target.value })}
              />
            </label>
            <label className="color-field">
              Text
              <input
                type="color"
                value={settings.customText}
                onChange={(e) => updateSettings({ customText: e.target.value })}
              />
            </label>
          </div>
        )}

        <span className="setting-label">Accent color</span>
        <div className="color-row">
          <label className="color-field">
            Accent
            <input
              type="color"
              value={settings.accentColor || themeAccent(settings.theme)}
              onChange={(e) => updateSettings({ accentColor: e.target.value })}
            />
          </label>
          {settings.accentColor && (
            <button className="btn btn-ghost" onClick={() => updateSettings({ accentColor: "" })}>
              Use theme default
            </button>
          )}
        </div>

        <span className="setting-label">{Icon.Type} Journal font</span>
        <select
          className="font-select"
          value={settings.font}
          onChange={(e) => updateSettings({ font: e.target.value as Settings["font"] })}
        >
          {FONTS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.name} — {f.desc}
            </option>
          ))}
        </select>
        <p className="font-option-preview" style={{ fontFamily: selectedFont.css }}>
          “The quiet evening settled in, and there was time to think.” — Aa Bb Cc 0123
        </p>

        <span className="setting-label">{Icon.TextSize} Text size</span>
        <div className="segmented">
          {(["small", "medium", "large"] as const).map((s) => (
            <button
              key={s}
              className={settings.fontSize === s ? "active" : ""}
              onClick={() => updateSettings({ fontSize: s })}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <span className="setting-label">{Icon.Rows} Interface density</span>
        <div className="segmented">
          {(["compact", "comfortable"] as const).map((s) => (
            <button
              key={s}
              className={settings.density === s ? "active" : ""}
              onClick={() => updateSettings({ density: s })}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
          />
          Reduce motion
        </label>
        <p className="sub" style={{ marginTop: -4 }}>
          Turns off sliding and scaling animations, keeping instant state
          changes. It starts from your system's motion preference, but your
          choice here always wins — uncheck it to see the animations even if
          Windows has them disabled.
        </p>

        <div className="card preview-card">
          <div className="widget-title">Live preview</div>
          <div className="sample-title">Tuesday evening</div>
          <div className="sample-text">
            Walked home the long way today. The air was cold, the kind that
            wakes you up gently. Nothing special happened — and that was
            exactly what I needed.
          </div>
        </div>
      </section>

      {/* ---------- Writing ---------- */}
      <section className="settings-section">
        <h2>Writing</h2>
        <p className="sub">How the text behaves while you type.</p>

        <span className="setting-label">{Icon.Pen} Text motion</span>
        <div className="segmented">
          {(["fluid", "minimal", "none"] as const).map((m) => (
            <button
              key={m}
              className={settings.textMotion === m ? "active" : ""}
              onClick={() => updateSettings({ textMotion: m })}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          <strong>Fluid</strong> — letters settle as you type and reflowing text
          glides into place. <strong>Minimal</strong> — just the subtle letter
          settle. <strong>None</strong> — text appears instantly.
        </p>
      </section>

      {/* ---------- Inspiration ---------- */}
      <section className="settings-section">
        <h2>Inspiration</h2>
        <p className="sub">
          A small quote on your dashboard. Everything is bundled in the app —
          no internet, ever.
        </p>

        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.showQuote}
            onChange={(e) => updateSettings({ showQuote: e.target.checked })}
          />
          Show quote on startup
        </label>

        {settings.showQuote && (
          <>
            <span className="setting-label">Quote category</span>
            <select
              className="font-select"
              value={settings.quoteCategory}
              onChange={(e) => updateSettings({ quoteCategory: e.target.value })}
            >
              <option value="all">All</option>
              {QUOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.showNarrator}
                onChange={(e) => updateSettings({ showNarrator: e.target.checked })}
              />
              Show narrator
            </label>

            <span className="setting-label">New quote every</span>
            <div className="segmented">
              {(["startup", "day"] as const).map((s) => (
                <button
                  key={s}
                  className={settings.quoteRotate === s ? "active" : ""}
                  onClick={() => updateSettings({ quoteRotate: s })}
                >
                  {s === "startup" ? "Startup" : "Day"}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---------- Data ---------- */}
      <section className="settings-section">
        <h2>Data</h2>
        <p className="sub">
          Your journal lives only on this computer ({entries.length}{" "}
          {entries.length === 1 ? "entry" : "entries"}). Backups are your
          safety net — keep one on a USB drive or external disk.
        </p>
        <div className="data-actions">
          <button className="btn" disabled={busy !== ""} onClick={() => run("backup", backup)}>
            {busy === "backup" ? "Working…" : Icon.Save}
            {busy === "backup" ? "" : "Create Backup (.journal)"}
          </button>
          <button className="btn" disabled={busy !== ""} onClick={() => run("restore", restore)}>
            {busy === "restore" ? "Working…" : Icon.Download}
            {busy === "restore" ? "" : "Restore Backup"}
          </button>
          <button className="btn" disabled={busy !== ""} onClick={() => run("md", exportMd)}>
            {busy === "md" ? "Working…" : Icon.FileText}
            {busy === "md" ? "" : "Export as Markdown"}
          </button>
          <button className="btn" disabled={busy !== ""} onClick={() => run("json", exportJson)}>
            {busy === "json" ? "Working…" : Icon.Braces}
            {busy === "json" ? "" : "Export as JSON"}
          </button>
          <button className="btn" disabled={busy !== ""} onClick={() => run("import", importJson)}>
            {busy === "import" ? "Working…" : Icon.Upload}
            {busy === "import" ? "" : "Import Journal (JSON)"}
          </button>
          <button className="btn" disabled={busy !== ""} onClick={() => window.print()}>
            {Icon.Printer} Export as PDF (print dialog)
          </button>
        </div>
        {msg && <div className={`data-msg ${msg.error ? "error" : ""}`}>{msg.text}</div>}
      </section>

      {/* ---------- Security ---------- */}
      <section className="settings-section">
        <h2>Security</h2>
        <p className="sub">
          Protect your journal with a password. The whole database is encrypted
          — even if someone copies the file, they can't read it. Leave empty
          and save to remove the password.
        </p>
        <div style={{ maxWidth: 340, display: "grid", gap: 10 }}>
          <input
            className="input"
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Repeat password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          <button className="btn btn-primary" onClick={savePassword}>
            Save password
          </button>
          {pwMsg && <div className="data-msg">{pwMsg}</div>}
        </div>
        <p className="security-warning">
          <span className="security-warning-icon">{Icon.Alert}</span>
          If you forget your password, your entries cannot be recovered —
          keep it somewhere safe.
        </p>
      </section>
    </div>
  );
}

function themeAccent(theme: ThemeKey): string {
  return THEMES.find((t) => t.key === theme)?.colors[2] ?? "#c89b6d";
}
