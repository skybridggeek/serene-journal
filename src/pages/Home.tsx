import type { ReactNode } from "react";
import { Inspiration } from "../components/Inspiration";
import { Icon } from "../components/Shared";
import type { EntrySummary, Settings } from "../types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function greetingEmoji(): ReactNode {
  const h = new Date().getHours();
  if (h < 5) return <span className="greeting-icon">{Icon.Moon}</span>;
  if (h < 12) return <span className="greeting-icon">{Icon.Sunrise}</span>;
  if (h < 18) return <span className="greeting-icon">{Icon.Sun}</span>;
  return <span className="greeting-icon">{Icon.Moon}</span>;
}

export function Home({
  entries,
  settings,
  onWriteToday,
  onNavigate,
}: {
  entries: EntrySummary[];
  settings: Settings;
  onWriteToday: () => void;
  onNavigate: (v: "insights" | "journal" | "settings") => void;
}) {
  const name = settings.userName.trim();

  return (
    <div className="content">
      <div className="greeting">
        {greeting()}
        {name ? `, ${name}` : ""} {greetingEmoji()}
      </div>
      <p className="greeting-sub">
        {!name ? (
          <>
            A quiet place for your thoughts.{" "}
            <button className="link-btn" onClick={() => onNavigate("settings")}>
              Add your name in Settings
            </button>{" "}
            to make it yours.
          </>
        ) : entries.length === 0 ? (
          "Your journal is ready whenever you are."
        ) : (
          `You have ${entries.length} ${entries.length === 1 ? "entry" : "entries"} — every one of them private.`
        )}
      </p>

      <button className="write-cta" onClick={onWriteToday}>
        <span className="write-cta-icon">{Icon.Pen}</span>
        <span className="write-cta-text">
          <strong>Write today's entry</strong>
          <small>Opens a fresh, quiet page</small>
        </span>
        <span className="write-cta-arrow">→</span>
      </button>

      <Inspiration settings={settings} />
    </div>
  );
}
