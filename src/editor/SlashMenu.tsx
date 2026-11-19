import type { Editor, Range } from "@tiptap/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";

export interface SlashItem {
  title: string;
  desc: string;
  keywords: string[];
  icon: ReactNode;
  command: (opts: { editor: Editor; range: Range }) => void;
}

export const SlashMenu = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  { items: SlashItem[]; command: (item: SlashItem) => void }
>(function SlashMenu({ items, command }, ref) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        command(items[index]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <div className="slash-empty">No matching blocks</div>
      </div>
    );
  }

  return (
    <div className="slash-menu">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          className={`slash-item ${i === index ? "selected" : ""}`}
          onClick={() => command(item)}
          onMouseEnter={() => setIndex(i)}
        >
          <span className="slash-icon">{item.icon}</span>
          <span className="slash-text">
            <strong>{item.title}</strong>
            <small>{item.desc}</small>
          </span>
        </button>
      ))}
    </div>
  );
});
