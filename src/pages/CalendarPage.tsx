import { useMemo, useState } from "react";
import { EmptyState, Icon } from "../components/Shared";
import { dateKey } from "../stats";
import { moodInfo, type EntrySummary } from "../types";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarPage({
  entries,
  onOpenDay,
}: {
  entries: EntrySummary[];
  onOpenDay: (entryId: number | null, date?: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  const byDate = useMemo(() => {
    const map = new Map<string, EntrySummary>();
    for (const e of entries) {
      if (!map.has(e.entryDate)) map.set(e.entryDate, e);
    }
    return map;
  }, [entries]);

  const first = new Date(year, month, 1);
  // shift so weeks start on Monday
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(now);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells: (null | { day: number; key: string })[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { day: i + 1, key: dateKey(d) };
    }),
  ];

  return (
    <div className="content">
      <h1 className="page-title">Calendar</h1>
      <p className="page-sub">Every dot is a day you showed up for yourself.</p>

      <div className="card">
        <div className="calendar-head">
          <button className="btn btn-ghost" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <span className="calendar-month">{monthLabel}</span>
          <button className="btn btn-ghost" onClick={() => shiftMonth(1)}>
            →
          </button>
        </div>

        <div className="calendar-grid cal-anim" key={`${year}-${month}`}>
          {DOW.map((d, i) => (
            <div className="calendar-dow" key={i}>
              {d}
            </div>
          ))}
          {cells.map((c, i) =>
            c === null ? (
              <div className="day-cell blank" key={`b${i}`} />
            ) : (
              <DayCell
                key={c.key}
                day={c.day}
                entryKey={c.key}
                entry={byDate.get(c.key)}
                isToday={c.key === todayKey}
                isFuture={c.key > todayKey}
                onOpen={onOpenDay}
              />
            )
          )}
        </div>
      </div>

      {entries.length === 0 && (
        <EmptyState
          icon={Icon.Calendar}
          title="No entries yet"
          body="Pick any day to write an entry for it."
        />
      )}
    </div>
  );
}

function DayCell({
  day,
  entryKey,
  entry,
  isToday,
  isFuture,
  onOpen,
}: {
  day: number;
  entryKey: string;
  entry?: EntrySummary;
  isToday: boolean;
  isFuture: boolean;
  onOpen: (entryId: number | null, date?: string) => void;
}) {
  const info = entry ? moodInfo(entry.mood) : null;
  return (
    <button
      className={`day-cell ${isToday ? "today" : ""} ${isFuture ? "future" : ""}`}
      onClick={() => onOpen(entry ? entry.id : null, entryKey)}
      title={entry ? entry.title || "Entry" : "Write for this day"}
    >
      <span>{day}</span>
      {info ? (
        <span className="mood-dot" style={{ background: info.color }} />
      ) : entry ? (
        <span className="mood-dot" style={{ background: "var(--accent)" }} />
      ) : (
        <span style={{ height: 8 }} />
      )}
    </button>
  );
}
