import { useEffect, useState } from "react";
import { api } from "../api";
import { QUOTES, type Quote } from "../quotes";
import { todayStr, type Settings } from "../types";

// one "startup" rotation per app launch, no matter how often Home re-renders
let sessionPicked = false;

function parseBag(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

function pickQuote(pool: Quote[], bagIds: number[]): { quote: Quote; bag: number[] } {
  const poolIds = new Set(pool.map((q) => q.id));
  let bag = bagIds.filter((id) => poolIds.has(id));
  if (bag.length === 0) bag = pool.map((q) => q.id);
  const id = bag[Math.floor(Math.random() * bag.length)];
  return { quote: pool.find((q) => q.id === id)!, bag: bag.filter((x) => x !== id) };
}

export function Inspiration({ settings }: { settings: Settings }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fading, setFading] = useState(false);

  const poolFor = (category: string) =>
    category === "all" ? QUOTES : QUOTES.filter((q) => q.category === category);

  useEffect(() => {
    if (!settings.showQuote) return;
    (async () => {
      const raw = await api.getAllSettings();
      const pool = poolFor(settings.quoteCategory);
      if (pool.length === 0) return;
      const bag = parseBag(raw["quote_bag"]);

      const currentId = Number(raw["quote_current"]);
      const current = pool.find((q) => q.id === currentId) ?? null;
      const keep =
        current !== null &&
        (settings.quoteRotate === "day"
          ? raw["quote_day"] === todayStr()
          : sessionPicked);

      if (keep) {
        setQuote(current);
        return;
      }
      await rotate(pool, bag);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showQuote, settings.quoteCategory, settings.quoteRotate]);

  async function rotate(pool?: Quote[], bagIds?: number[]) {
    const p = pool ?? poolFor(settings.quoteCategory);
    if (p.length === 0) return;
    const bag = bagIds ?? parseBag((await api.getAllSettings())["quote_bag"]);
    const { quote: q, bag: rest } = pickQuote(p, bag);
    sessionPicked = true;
    setQuote(q);
    await api.setSetting("quote_current", String(q.id));
    await api.setSetting("quote_bag", rest.join(","));
    await api.setSetting("quote_day", todayStr());
  }

  // fade the current quote out, swap it, then fade the new one in
  async function handleRotate() {
    if (fading) return;
    setFading(true);
    await new Promise((r) => setTimeout(r, 250));
    await rotate();
    setFading(false);
  }

  if (!settings.showQuote || !quote) return null;

  return (
    <div className={`inspiration ${fading ? "fading" : ""}`}>
      <div className="inspiration-head">
        <span className="inspiration-label">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          </svg>
          Today's thought
        </span>
        <button
          className="inspiration-new"
          onClick={() => void handleRotate()}
          title="Show another quote"
        >
          ↻
        </button>
      </div>
      <div className="inspiration-body">
        <p className="inspiration-quote">{quote.quote}</p>
        {settings.showNarrator && (
          <div className="inspiration-narrator">— {quote.narrator}</div>
        )}
      </div>
    </div>
  );
}
