import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Shared";

/// Floating formatting bar that appears when text is selected.
export function SelectionBar({
  editor,
  onLinkRequest,
}: {
  editor: Editor;
  onLinkRequest: () => void;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(() => {
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    if (
      empty ||
      !editor.isFocused ||
      state.doc.textBetween(from, to, " ").trim() === ""
    ) {
      setPos(null);
      return;
    }
    const a = view.coordsAtPos(from);
    const b = view.coordsAtPos(to);
    const left = Math.min(
      Math.max((a.left + b.left) / 2, 110),
      window.innerWidth - 110
    );
    setPos({ left, top: Math.min(a.top, b.top) });
  }, [editor]);

  useEffect(() => {
    const onBlur = () => {
      blurTimer.current = setTimeout(() => {
        if (!editor.isFocused) setPos(null);
      }, 120);
    };
    editor.on("transaction", update);
    editor.on("blur", onBlur);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      editor.off("transaction", update);
      editor.off("blur", onBlur);
      if (blurTimer.current) clearTimeout(blurTimer.current);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor, update]);

  if (!pos) return null;

  const stop = (e: React.MouseEvent) => e.preventDefault();

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    label: React.ReactNode,
    className = ""
  ) => (
    <button
      type="button"
      className={`${active ? "active" : ""} ${className}`}
      title={title}
      onMouseDown={stop}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div
      className="selection-bar"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={stop}
    >
      {btn(
        editor.isActive("bold"),
        "Bold (Ctrl+B)",
        () => editor.chain().focus().toggleBold().run(),
        <strong>B</strong>
      )}
      {btn(
        editor.isActive("italic"),
        "Italic (Ctrl+I)",
        () => editor.chain().focus().toggleItalic().run(),
        <em className="serif-i">I</em>
      )}
      {btn(
        editor.isActive("underline"),
        "Underline (Ctrl+U)",
        () => editor.chain().focus().toggleUnderline().run(),
        <span className="underlined">U</span>
      )}
      {btn(
        editor.isActive("strike"),
        "Strikethrough",
        () => editor.chain().focus().toggleStrike().run(),
        <span className="struck">S</span>
      )}
      <span className="selection-sep" />
      {btn(
        editor.isActive("bulletList"),
        "Bullet list",
        () => editor.chain().focus().toggleBulletList().run(),
        <span className="slash-glyph">•≡</span>
      )}
      {btn(
        editor.isActive("heading", { level: 2 }),
        "Heading",
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        <span className="slash-glyph">H</span>
      )}
      {btn(
        editor.isActive("blockquote"),
        "Quote",
        () => editor.chain().focus().toggleBlockquote().run(),
        <span className="slash-glyph">”</span>
      )}
      <span className="selection-sep" />
      {btn(
        editor.isActive("link"),
        "Link (Ctrl+K)",
        onLinkRequest,
        Icon.Link,
        "link-btn-icon"
      )}
    </div>
  );
}
