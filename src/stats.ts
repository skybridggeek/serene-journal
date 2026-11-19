import type { EntrySummary } from "./types";
import { plainFromMarkdown } from "./md";

/** Set of YYYY-MM-DD strings that have at least one entry. */
export function entryDates(entries: EntrySummary[]): Set<string> {
  return new Set(entries.map((e) => e.entryDate));
}

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Consecutive days with entries, counting back from today (or yesterday). */
export function currentStreak(dates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(dateKey(cursor))) return 0;
  }
  while (dates.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function longestStreak(dates: Set<string>): number {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const s of sorted) {
    const [y, m, d] = s.split("-").map(Number);
    const cur = new Date(y, m - 1, d);
    if (prev) {
      const diff = (cur.getTime() - prev.getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}

/** Entries created in the last N days (by entry date). */
export function entriesWithinDays(
  entries: EntrySummary[],
  days: number
): EntrySummary[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const key = dateKey(cutoff);
  return entries.filter((e) => e.entryDate >= key);
}

export function totalWords(entries: EntrySummary[]): number {
  return entries.reduce((sum, e) => {
    const text = plainFromMarkdown(e.content);
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);
}

export { dateKey };
