import { useMemo, useState } from "react";
import { EntryCard, EmptyState, Icon, MOODS, MoodFace } from "../components/Shared";
import { plainFromMarkdown } from "../md";
import type { EntrySummary } from "../types";

export function JournalList({
  entries,
  onOpenEntry,
  onNew,
}: {
  entries: EntrySummary[];
  onOpenEntry: (id: number) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (mood && e.mood !== mood) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        plainFromMarkdown(e.content).toLowerCase().includes(q) ||
        e.tags.toLowerCase().includes(q)
      );
    });
  }, [entries, query, mood]);

  return (
    <div className="content">
      <h1 className="page-title">Journal</h1>
      <p className="page-sub">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </p>

      <div className="list-toolbar">
        <input
          className="input"
          placeholder="Search your entries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary" onClick={onNew}>
          {Icon.Pen} New
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        <button
          className={`chip ${mood === "" ? "active" : ""}`}
          onClick={() => setMood("")}
        >
          All moods
        </button>
        {MOODS.map((m) => (
          <button
            key={m.key}
            className={`chip ${mood === m.key ? "active" : ""}`}
            onClick={() => setMood(mood === m.key ? "" : m.key)}
            title={m.label}
          >
            <MoodFace mood={m.key} size={15} /> {m.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Icon.Search}
          title={entries.length === 0 ? "Your journal is empty" : "Nothing found"}
          body={
            entries.length === 0
              ? "Press “New” and write your first entry."
              : "Try a different search or mood filter."
          }
        />
      ) : (
        filtered.map((e) => (
          <EntryCard key={e.id} entry={e} onOpen={onOpenEntry} />
        ))
      )}
    </div>
  );
}
