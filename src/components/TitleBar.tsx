import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const win = getCurrentWindow();

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      setMaximized(await win.isMaximized());
      const un = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
      if (disposed) un();
      else unlisten = un;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <path d="M16 8 2 22" />
          <path d="M17.5 15H9" />
        </svg>
        Serene Journal
      </span>
      <div className="titlebar-controls">
        <button
          className="tb-btn"
          onClick={() => win.minimize()}
          title="Minimize"
          tabIndex={-1}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="tb-btn"
          onClick={() => win.toggleMaximize()}
          title={maximized ? "Restore" : "Maximize"}
          tabIndex={-1}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" />
              <path d="M2.5 2.5 v-2 h7 v7 h-2" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
            </svg>
          )}
        </button>
        <button
          className="tb-btn tb-close"
          onClick={() => win.close()}
          title="Close"
          tabIndex={-1}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
