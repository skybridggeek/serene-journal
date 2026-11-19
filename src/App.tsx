import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Lock } from "./components/Lock";
import { Icon } from "./components/Shared";
import { TitleBar } from "./components/TitleBar";
import { CalendarPage } from "./pages/CalendarPage";
import { Editor } from "./pages/Editor";
import { Home } from "./pages/Home";
import { Insights } from "./pages/Insights";
import { JournalList } from "./pages/JournalList";
import { SettingsPage } from "./pages/SettingsPage";
import { applySettings } from "./theme";
import { plainFromMarkdown } from "./md";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  type EntrySummary,
  type Settings,
  moodInfo,
} from "./types";

export type View =
  | { name: "home" | "journal" | "calendar" | "insights" | "settings" }
  | { name: "editor"; entryId: number | null; date?: string };

function loadSettings(raw: Record<string, string>): Settings {
  const s = { ...DEFAULT_SETTINGS };
  (Object.keys(SETTINGS_KEYS) as (keyof Settings)[]).forEach((k) => {
    const v = raw[SETTINGS_KEYS[k]];
    if (v === undefined) return;
    if (typeof s[k] === "boolean") {
      (s as Record<string, string | boolean>)[k] = v === "true";
    } else {
      (s as Record<string, string | boolean>)[k] = v;
    }
  });
  // No explicit choice yet? Follow the OS reduced-motion preference once —
  // after that the in-app toggle is authoritative and can force motion on.
  if (raw[SETTINGS_KEYS.reduceMotion] === undefined) {
    s.reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  return s;
}

export default function App() {
  const [boot, setBoot] = useState<"loading" | "locked" | "ready">("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [view, setView] = useState<View>({ name: "home" });
  // key changes force the editor to remount for a different entry
  const [editorKey, setEditorKey] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    actionLabel: string;
    onAction: () => void;
  } | null>(null);
  // deferred delete: the row is hidden immediately but only removed from the
  // database after the undo window closes, so Undo needs no data restore.
  const pendingDeleteRef = useRef<{
    id: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const hiddenIdsRef = useRef<Set<number>>(new Set());
  // which top-level tab the editor should return to on back/delete
  const returnViewRef = useRef<
    "home" | "journal" | "calendar" | "insights" | "settings"
  >("home");
  const viewRef = useRef<View>(view);
  viewRef.current = view;

  const finishBoot = useCallback(async () => {
    const raw = await api.getAllSettings();
    const s = loadSettings(raw);
    setSettings(s);
    applySettings(s);
    setEntries(await api.listEntries());
    setBoot("ready");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const st = await api.dbStatus();
        if (st.encrypted) {
          setBoot("locked");
          return;
        }
        await api.dbOpen(null);
        await finishBoot();
      } catch (e) {
        console.error("boot failed", e);
      }
    })();
  }, [finishBoot]);

  async function unlock(password: string) {
    await api.dbOpen(password);
    await finishBoot();
  }

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        applySettings(next);
        return next;
      });
      for (const [k, v] of Object.entries(patch)) {
        await api.setSetting(SETTINGS_KEYS[k as keyof Settings], String(v));
      }
    },
    []
  );

  const refreshEntries = useCallback(async () => {
    const list = await api.listEntries();
    setEntries(list.filter((e) => !hiddenIdsRef.current.has(e.id)));
  }, []);

  const undoDelete = useCallback(() => {
    const p = pendingDeleteRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    hiddenIdsRef.current.delete(p.id);
    pendingDeleteRef.current = null;
    setToast(null);
    void (async () => {
      const list = await api.listEntries();
      setEntries(list.filter((x) => !hiddenIdsRef.current.has(x.id)));
    })();
  }, []);

  const requestDelete = useCallback(
    (id: number) => {
      hiddenIdsRef.current.add(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setView({ name: returnViewRef.current });
      const timer = setTimeout(() => {
        void (async () => {
          try {
            await api.deleteEntry(id);
          } catch (e) {
            console.error("delete failed", e);
          }
          hiddenIdsRef.current.delete(id);
          if (pendingDeleteRef.current?.id === id) {
            pendingDeleteRef.current = null;
            setToast(null);
          }
          const list = await api.listEntries();
          setEntries(list.filter((x) => !hiddenIdsRef.current.has(x.id)));
        })();
      }, 5000);
      pendingDeleteRef.current = { id, timer };
      setToast({ message: "Entry deleted", actionLabel: "Undo", onAction: undoDelete });
    },
    [undoDelete]
  );

  // commit any pending delete if the app is closing
  useEffect(
    () => () => {
      const p = pendingDeleteRef.current;
      if (p) {
        clearTimeout(p.timer);
        void api.deleteEntry(p.id).catch(() => {});
      }
    },
    []
  );

  const openEditor = useCallback((entryId: number | null, date?: string) => {
    const cur = viewRef.current;
    if (cur.name !== "editor") returnViewRef.current = cur.name;
    setEditorKey((k) => k + 1);
    setView({ name: "editor", entryId, date });
  }, []);

  if (boot === "loading") {
    return (
      <>
        <TitleBar />
        <div className="splash">
          <div className="brand-mark">{Icon.Feather}</div>
        </div>
      </>
    );
  }

  if (boot === "locked") {
    return (
      <>
        <TitleBar />
        <Lock onUnlock={unlock} />
      </>
    );
  }

  const navItems = [
    { key: "home", label: "Home", icon: Icon.Home },
    { key: "journal", label: "Journal", icon: Icon.Book },
    { key: "calendar", label: "Calendar", icon: Icon.Calendar },
    { key: "insights", label: "Insights", icon: Icon.Chart },
    { key: "settings", label: "Settings", icon: Icon.Gear },
  ] as const;

  const mobileNav = [
    { key: "home", label: "Home", icon: Icon.Home },
    { key: "journal", label: "Journal", icon: Icon.Book },
    { key: "calendar", label: "Calendar", icon: Icon.Calendar },
    { key: "settings", label: "Profile", icon: Icon.User },
  ] as const;

  const activeKey = view.name === "editor" ? "journal" : view.name;

  type TopView = "home" | "journal" | "calendar" | "insights" | "settings";

  const navButton = (key: TopView, label: string, icon: React.ReactNode) => (
    <button
      key={key}
      className={`nav-item ${activeKey === key ? "active" : ""}`}
      onClick={() => setView({ name: key })}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const streakDays = entries.length > 0 ? computeMiniStreak(entries) : 0;

  let page: React.ReactNode = null;
  switch (view.name) {
    case "home":
      page = (
        <Home
          entries={entries}
          settings={settings}
          onWriteToday={() => openEditor(null, todayLocal())}
          onNavigate={(v) => setView({ name: v })}
        />
      );
      break;
    case "journal":      page = (
        <JournalList
          entries={entries}
          onOpenEntry={(id) => openEditor(id)}
          onNew={() => openEditor(null, todayLocal())}
        />
      );
      break;
    case "calendar":
      page = (
        <CalendarPage entries={entries} onOpenDay={openEditor} />
      );
      break;
    case "insights":
      page = <Insights entries={entries} />;
      break;
    case "settings":
      page = (
        <SettingsPage
          settings={settings}
          updateSettings={updateSettings}
          entries={entries}
          onRestored={async () => {
            // after a restore the database must be reopened
            setBoot("loading");
            const st = await api.dbStatus();
            if (st.encrypted) {
              setBoot("locked");
            } else {
              await api.dbOpen(null);
              await finishBoot();
            }
          }}
        />
      );
      break;
    case "editor":
      page = (
        <Editor
          key={editorKey}
          entryId={view.entryId}
          initialDate={view.date ?? todayLocal()}
          onBack={() => setView({ name: returnViewRef.current })}
          onSaved={refreshEntries}
          onRequestDelete={requestDelete}
        />
      );
      break;
  }

  return (
    <>
      <TitleBar />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">{Icon.Feather}</span>
            Serene Journal
          </div>
          {navItems.map((n) => navButton(n.key, n.label, n.icon))}
          <div className="sidebar-footer">
            {streakDays > 0 ? (
              <span className="streak-note">
                {Icon.Flame} {streakDays}-day streak — keep it going
              </span>
            ) : (
              "Your thoughts stay private, on this device only."
            )}
          </div>
        </aside>
        <main className="main">{page}</main>
        <nav className="bottom-nav">
          {mobileNav.map((n) => navButton(n.key, n.label, n.icon))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-msg">{toast.message}</span>
          <button className="toast-action" onClick={toast.onAction}>
            {toast.actionLabel}
          </button>
        </div>
      )}
      <PrintRoot entries={entries} />
    </>
  );
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function computeMiniStreak(entries: EntrySummary[]): number {
  const dates = new Set(entries.map((e) => e.entryDate));
  let streak = 0;
  const cursor = new Date();
  const key = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };
  if (!dates.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(key(cursor))) return 0;
  }
  while (dates.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function PrintRoot({ entries }: { entries: EntrySummary[] }) {
  return (
    <div className="print-root">
      <h1>My Journal</h1>
      {[...entries].reverse().map((e) => {
        const info = moodInfo(e.mood);
        return (
          <div className="print-entry" key={e.id}>
            <h2>{e.title.trim() || "Untitled"}</h2>
            <div className="meta">
              {e.entryDate}
              {info ? ` · ${info.label}` : ""}
            </div>
            <div className="body">{plainFromMarkdown(e.content)}</div>
          </div>
        );
      })}
    </div>
  );
}
