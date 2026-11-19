import { useMemo } from "react";
import { EmptyState, Icon, MOODS, MoodFace } from "../components/Shared";
import {
  currentStreak,
  dateKey,
  entriesWithinDays,
  entryDates,
  longestStreak,
  totalWords,
} from "../stats";
import type { EntrySummary } from "../types";

export function Insights({ entries }: { entries: EntrySummary[] }) {
  const dates = entryDates(entries);

  const moodCounts = useMemo(
    () =>
      MOODS.map((m) => ({
        ...m,
        count: entries.filter((e) => e.mood === m.key).length,
      })),
    [entries]
  );
  const maxMood = Math.max(1, ...moodCounts.map((m) => m.count));

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags ? e.tags.split(",") : []) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [entries]);
  const maxTag = Math.max(1, ...tagCounts.map(([, c]) => c));

  const months = useMemo(() => {
    const out: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({
        label: d.toLocaleDateString(undefined, { month: "short" }),
        count: entries.filter((e) => e.entryDate.startsWith(prefix)).length,
      });
    }
    return out;
  }, [entries]);
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  const streak = currentStreak(dates);
  const last30 = entriesWithinDays(entries, 30);
  const mood30 = MOODS.map((m) => ({
    ...m,
    count: last30.filter((e) => e.mood === m.key).length,
  }));
  const maxMood30 = Math.max(1, ...mood30.map((m) => m.count));

  // last 5 weeks of consistency dots, oldest → newest, ending today
  const cells: { key: string; on: boolean }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 34);
  for (let i = 0; i < 35; i++) {
    cells.push({ key: dateKey(cursor), on: dates.has(dateKey(cursor)) });
    cursor.setDate(cursor.getDate() + 1);
  }

  if (entries.length === 0) {
    return (
      <div className="content">
        <h1 className="page-title">Insights</h1>
        <p className="page-sub">Gentle patterns from your journaling.</p>
        <EmptyState
          icon={Icon.Chart}
          title="Nothing to show yet"
          body="Insights appear once you write your first entries."
        />
      </div>
    );
  }

  return (
    <div className="content">
      <h1 className="page-title">Insights</h1>
      <p className="page-sub">Gentle patterns from your journaling — no goals, no pressure.</p>

      <div className="stats-grid">
        <div className="card">
          <div className="stat-value">{entries.length}</div>
          <div className="stat-label">Total entries</div>
        </div>
        <div className="card">
          <div className="stat-value">{totalWords(entries).toLocaleString()}</div>
          <div className="stat-label">Words written</div>
        </div>
        <div className="card">
          <div className="stat-value">{currentStreak(dates)}</div>
          <div className="stat-label">Current streak (days)</div>
        </div>
        <div className="card">
          <div className="stat-value">{longestStreak(dates)}</div>
          <div className="stat-label">Longest streak (days)</div>
        </div>
      </div>

      <div className="home-grid">
        <div className="card">
          <div className="widget-title">Consistency</div>
          <div className="streak-number">{streak}</div>
          <div className="streak-label">
            {streak === 1 ? "day streak" : "days in a row"} · last 5 weeks
          </div>
          <div className="streak-grid">
            {cells.map((c) => (
              <div
                key={c.key}
                className={`streak-cell ${c.on ? "on" : ""}`}
                title={c.key}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <div className="widget-title">Mood · last 30 days</div>
          {last30.length === 0 ? (
            <p style={{ color: "var(--text-2)", fontSize: "0.9em" }}>
              Write a few entries and your moods will appear here.
            </p>
          ) : (
            mood30.map((m) => (
              <div className="mood-row" key={m.key}>
                <span className="emoji">
                <MoodFace mood={m.key} />
              </span>
                <div className="mood-track">
                  <div
                    className="mood-fill"
                    style={{
                      width: `${(m.count / maxMood30) * 100}%`,
                      background: m.color,
                    }}
                  />
                </div>
                <span className="mood-count">{m.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="insight-grid">
        <div className="card">
          <div className="widget-title">Moods · all time</div>
          {moodCounts.map((m) => (
            <div className="mood-row" key={m.key}>
              <span className="emoji">
                <MoodFace mood={m.key} />
              </span>
              <div className="mood-track">
                <div
                  className="mood-fill"
                  style={{
                    width: `${(m.count / maxMood) * 100}%`,
                    background: m.color,
                  }}
                />
              </div>
              <span className="mood-count">{m.count}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="widget-title">Last 6 months</div>
          <div className="month-bars">
            {months.map((m) => (
              <div className="month-bar-wrap" key={m.label}>
                <div
                  className="month-bar"
                  style={{ height: `${Math.max(4, (m.count / maxMonth) * 100)}%` }}
                  title={`${m.count} entries`}
                />
                <span className="month-bar-label">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="widget-title" style={{ marginTop: 22 }}>
            Tags
          </div>
          {tagCounts.length === 0 ? (
            <p style={{ color: "var(--text-2)", fontSize: "0.9em" }}>
              You haven't used any tags yet.
            </p>
          ) : (
            tagCounts.map(([tag, count]) => (
              <div className="mood-row" key={tag}>
                <span style={{ width: 90, fontSize: "0.88em" }}>{tag}</span>
                <div className="mood-track">
                  <div
                    className="mood-fill"
                    style={{
                      width: `${(count / maxTag) * 100}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <span className="mood-count">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <p style={{ color: "var(--text-2)", fontSize: "0.85em", marginTop: 24 }}>
        Based on {entriesWithinDays(entries, 365).length} entries from the past
        year · everything is computed on your device.
      </p>
    </div>
  );
}
