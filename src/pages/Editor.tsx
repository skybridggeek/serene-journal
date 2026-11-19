import { open } from "@tauri-apps/plugin-dialog";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon, MOODS, MoodFace } from "../components/Shared";
import { PhotoView } from "../editor/PhotoView";
import { SelectionBar } from "../editor/SelectionBar";
import { SlashCommands } from "../editor/SlashCommands";
import { TypeMotion } from "../editor/TypeMotion";
import { plainFromMarkdown } from "../md";
import { SUGGESTED_TAGS, wordCount } from "../types";

type SaveState = "saved" | "saving" | "dirty";

const Photo = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(PhotoView);
  },
});

function getMarkdown(ed: TiptapEditor): string {
  const storage = ed.storage as {
    markdown?: { getMarkdown?: () => string };
  };
  return storage.markdown?.getMarkdown?.() ?? ed.getText();
}

function collectPhotos(ed: TiptapEditor): string[] {
  const srcs: string[] = [];
  ed.state.doc.descendants((n) => {
    if (n.type.name === "image") {
      const src = String(n.attrs.src ?? "");
      if (src && !/^(data:|https?:|asset:)/.test(src) && !srcs.includes(src)) {
        srcs.push(src);
      }
    }
  });
  return srcs;
}

export function Editor({
  entryId,
  initialDate,
  onBack,
  onSaved,
  onRequestDelete,
}: {
  entryId: number | null;
  initialDate: string;
  onBack: () => void;
  onSaved: () => void;
  onRequestDelete: (id: number) => void;
}) {
  const [loaded, setLoaded] = useState(entryId === null);
  const [id, setId] = useState<number | null>(entryId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveFaded, setSaveFaded] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const idRef = useRef(id);
  idRef.current = id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef(0);
  const stateRef = useRef({ title, content, mood, entryDate, tags, photos });
  stateRef.current = { title, content, mood, entryDate, tags, photos };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({
        placeholder: "Start writing…  (type / for commands)",
      }),
      Photo,
      Markdown.configure({
        html: false,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashCommands.configure({ onPickImage: () => attachFromDialog() }),
      TypeMotion,
    ],
    editorProps: {
      attributes: { class: "editor-area prose" },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          void importFileObjects(files);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          void importFileObjects(files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      setContent(getMarkdown(ed));
      const srcs = collectPhotos(ed);
      setPhotos((prev) =>
        prev.length === srcs.length && prev.every((v, i) => v === srcs[i])
          ? prev
          : srcs
      );
    },
    autofocus: entryId === null ? "end" : false,
  });

  const editorRef = useRef<TiptapEditor | null>(editor);
  editorRef.current = editor;

  // Load existing entry
  useEffect(() => {
    if (entryId === null || !editor) return;
    (async () => {
      const e = await api.getEntry(entryId);
      setTitle(e.title);
      setMood(e.mood);
      setEntryDate(e.entryDate);
      setTags(e.tags);
      editor.commands.setContent(e.content || "", { emitUpdate: false });
      // legacy entries kept photos outside the text — move them inline
      const existing = new Set(collectPhotos(editor));
      const missing = e.photos.filter((p) => !existing.has(p));
      if (missing.length > 0) {
        editor
          .chain()
          .focus("end")
          .insertContent(
            missing.map((p) => ({ type: "image", attrs: { src: p } }))
          )
          .run();
      }
      setPhotos(collectPhotos(editor));
      setContent(getMarkdown(editor));
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, editor]);

  const doSave = useCallback(async () => {
    const s = stateRef.current;
    const isEmpty =
      !s.title.trim() &&
      !plainFromMarkdown(s.content) &&
      !s.mood &&
      s.photos.length === 0;
    if (isEmpty) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    try {
      const newId = await api.saveEntry({
        id: idRef.current,
        title: s.title,
        content: s.content,
        mood: s.mood,
        entryDate: s.entryDate,
        tags: s.tags,
        photos: s.photos,
      });
      idRef.current = newId;
      setId(newId);
      setSaveState("saved");
      onSaved();
    } catch (e) {
      console.error(e);
      setSaveState("dirty");
    }
  }, [onSaved]);

  // Debounced autosave
  useEffect(() => {
    if (!loaded) return;
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, content, mood, entryDate, tags, photos, loaded, doSave]);

  const flushSave = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await doSave();
  }, [doSave]);

  // after a save settles, let the "Saved ✓" label fade back gently
  useEffect(() => {
    if (saveState !== "saved") {
      setSaveFaded(false);
      return;
    }
    const t = setTimeout(() => setSaveFaded(true), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const flushAndLeave = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (saveState !== "saved") await doSave();
    onBack();
  }, [doSave, onBack, saveState]);

  // Photo lightbox requests coming from inline images
  useEffect(() => {
    const onZoom = (e: Event) =>
      setZoomUrl((e as CustomEvent<string>).detail);
    window.addEventListener("serene-photo-zoom", onZoom);
    return () => window.removeEventListener("serene-photo-zoom", onZoom);
  }, []);

  // Focus mode drives a body class the CSS reacts to
  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
    return () => document.body.classList.remove("focus-mode");
  }, [focusMode]);

  // Global shortcuts: F11 focus, Esc back/close, Ctrl+S save, Ctrl+K link
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        setFocusMode((f) => !f);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openLinkModal();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushSave();
        return;
      }
      if (e.key === "Escape") {
        if (zoomUrl) {
          setZoomUrl(null);
        } else if (confirmDelete) {
          setConfirmDelete(false);
        } else if (linkOpen) {
          setLinkOpen(false);
        } else if (focusMode) {
          setFocusMode(false);
        } else {
          void flushAndLeave();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomUrl, confirmDelete, linkOpen, focusMode, flushSave, flushAndLeave]);

  async function importFileObjects(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const data = new Uint8Array(await f.arrayBuffer());
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const filename = await api.importPhotoBytes(ext, data);
        editorRef.current?.chain().focus().setImage({ src: filename }).run();
      } catch (err) {
        console.error("Could not import image", err);
      }
    }
  }

  async function attachFromDialog() {
    setAddingPhotos(true);
    try {
      const picked = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"],
          },
        ],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      for (const p of paths) {
        const filename = await api.importPhoto(p);
        editorRef.current?.chain().focus().setImage({ src: filename }).run();
      }
    } finally {
      setAddingPhotos(false);
    }
  }

  function openLinkModal() {
    const ed = editorRef.current;
    if (!ed) return;
    setLinkUrl(ed.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    const ed = editorRef.current;
    if (!ed) return;
    let href = linkUrl.trim();
    if (href) {
      if (!/^(https?:|mailto:|tel:)/i.test(href)) href = `https://${href}`;
      ed.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  }

  function addTag(name: string) {
    const t = name.trim();
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeEntry() {
    if (idRef.current === null) return;
    setConfirmDelete(true);
  }

  async function confirmDeleteEntry() {
    if (idRef.current === null) {
      setConfirmDelete(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = idRef.current;
    setConfirmDelete(false);
    onRequestDelete(id);
  }

  const words = wordCount(plainFromMarkdown(content));
  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "dirty" ? "…" : "Saved ✓";

  if (!loaded || !editor) {
    return (
      <div className="splash">
        <div className="brand-mark">{Icon.Feather}</div>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <div className="editor-topbar">
        <button className="btn btn-ghost" onClick={flushAndLeave} title="Back">
          ← Back
        </button>
        <input
          type="date"
          className="date-input"
          value={entryDate}
          max="2999-12-31"
          onChange={(e) => e.target.value && setEntryDate(e.target.value)}
        />
        <span className={`save-state ${saveFaded ? "faded" : ""}`}>
          {saveLabel}
        </span>
        <button
          className="btn btn-ghost"
          onClick={() => setFocusMode(true)}
          title="Focus mode (F11) — Esc to exit"
        >
          Focus
        </button>
        {id !== null && (
          <button
            className="btn btn-ghost btn-danger"
            onClick={removeEntry}
            title="Delete entry"
          >
            Delete
          </button>
        )}
      </div>

      <div
        className={`editor-scroll ${dragOver ? "drag-over" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragCounter.current++;
          setDragOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragCounter.current--;
          if (dragCounter.current <= 0) setDragOver(false);
        }}
        onDrop={(e) => {
          dragCounter.current = 0;
          setDragOver(false);
          if (e.defaultPrevented) return; // handled inside the text area
          e.preventDefault();
          if (e.dataTransfer?.files.length) {
            void importFileObjects(e.dataTransfer.files);
          }
        }}
      >
        <div className="editor-paper">
          <input
            className="editor-title"
            placeholder="Give it a title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="editor-mood-row">
            {MOODS.map((m) => (
              <button
                key={m.key}
                className={`mood-btn ${mood === m.key ? "active" : ""}`}
                title={m.label}
                onClick={() => {
                  const next = mood === m.key ? "" : m.key;
                  if (next && typeof navigator.vibrate === "function") {
                    navigator.vibrate(8);
                  }
                  setMood(next);
                }}
              >
                <MoodFace mood={m.key} size={22} />
              </button>
            ))}
          </div>

          <EditorContent editor={editor} />

          <div
            className="photo-drop"
            onClick={attachFromDialog}
            title="Attach photos"
          >
            {addingPhotos ? "…" : Icon.Camera}
            <span className="photo-drop-text">
              <strong>{addingPhotos ? "Adding…" : "Add photo"}</strong>
              <small>or drag it anywhere on the page</small>
            </span>
          </div>

          <div className="editor-tags">
            {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
              <button key={t} className="chip" onClick={() => addTag(t)}>
                + {t}
              </button>
            ))}
            {tags.map((t) => (
              <button
                key={t}
                className="chip active"
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                title="Remove tag"
              >
                {t} ×
              </button>
            ))}
            <input
              className="tag-input"
              placeholder="+ add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => tagInput.trim() && addTag(tagInput)}
            />
          </div>

          <div className="editor-footer">
            <span>{words === 0 ? "" : `${words} words`}</span>
            <span className="word-count">Private · stored only on this device</span>
          </div>
        </div>
      </div>

      {editor && (
        <SelectionBar editor={editor} onLinkRequest={openLinkModal} />
      )}

      {linkOpen && (
        <div className="modal-backdrop" onClick={() => setLinkOpen(false)}>
          <div className="card link-modal" onClick={(e) => e.stopPropagation()}>
            <strong>Add a link</strong>
            <input
              className="input"
              placeholder="https://example.com"
              value={linkUrl}
              autoFocus
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyLink();
                if (e.key === "Escape") setLinkOpen(false);
              }}
            />
            <div className="link-modal-actions">
              {editor.isActive("link") && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setLinkUrl("");
                    applyLink();
                  }}
                >
                  Remove link
                </button>
              )}
              <button className="btn" onClick={() => setLinkOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={applyLink}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="card link-modal" onClick={(e) => e.stopPropagation()}>
            <strong>Delete this entry?</strong>
            <p className="confirm-delete-body">
              This can't be undone. The entry will be permanently removed from
              your journal.
            </p>
            <div className="link-modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteEntry}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomUrl && (
        <div className="photo-lightbox" onClick={() => setZoomUrl(null)}>
          <button
            className="photo-lightbox-close"
            onClick={() => setZoomUrl(null)}
            title="Close"
          >
            ×
          </button>
          <img src={zoomUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
