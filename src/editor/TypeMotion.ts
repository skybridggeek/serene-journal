import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

interface Item {
  from: number;
  to: number;
  at: number;
}

interface MotionState {
  items: Item[];
  decos: DecorationSet;
}

const key = new PluginKey<MotionState>("typeMotion");

const LIFETIME = 200; // ms a typed span stays decorated (>= CSS animation)
const MAX_RUN = 4; // ignore anything longer (entry loads, bulk inserts)
const FLIP_BLOCK_LIMIT = 300; // skip FLIP on very long docs to avoid jank

type Level = "fluid" | "minimal" | "none";
function level(): Level {
  const v = document.documentElement.dataset.textmotion;
  return v === "none" || v === "minimal" ? v : "fluid";
}

/** Pure insertions in a transaction, mapped to final document coordinates. */
function insertedRanges(tr: Transaction): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  tr.steps.forEach((step, i) => {
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      // a keystroke inserts into an empty range; loads/replacements delete text
      if (oldEnd === oldStart && newEnd > newStart) {
        let from = newStart;
        let to = newEnd;
        for (let j = i + 1; j < tr.steps.length; j++) {
          const m = tr.steps[j].getMap();
          from = m.map(from);
          to = m.map(to);
        }
        out.push({ from, to });
      }
    });
  });
  return out;
}

function build(items: Item[], doc: PMNode): DecorationSet {
  return items.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(
        doc,
        items.map((it) => Decoration.inline(it.from, it.to, { class: "type-in" }))
      );
}

/**
 * Glides top-level blocks to their new vertical position after a reflow or a
 * new line, instead of letting them snap. Measures layout offsetTop (which is
 * transform-independent) so overlapping animations never feed back on each
 * other. Only the vertical shift is animated — that covers Enter and lines
 * growing taller and pushing the text below them down.
 */
class ReflowController {
  private tops = new Map<Element, number>();

  constructor(private view: EditorView) {
    this.snapshot();
  }

  update(view: EditorView, prevState: { doc: PMNode }) {
    this.view = view;
    if (level() !== "fluid" || prevState.doc === view.state.doc) {
      this.snapshot();
      return;
    }
    this.flip();
    this.snapshot();
  }

  destroy() {
    this.tops.clear();
  }

  private blocks(): HTMLElement[] {
    return Array.from(this.view.dom.children) as HTMLElement[];
  }

  private snapshot() {
    const next = new Map<Element, number>();
    for (const el of this.blocks()) next.set(el, el.offsetTop);
    this.tops = next;
  }

  private flip() {
    const blocks = this.blocks();
    if (blocks.length > FLIP_BLOCK_LIMIT) return;
    for (const el of blocks) {
      const oldTop = this.tops.get(el);
      if (oldTop === undefined) continue; // newly created block: no glide
      const dy = oldTop - el.offsetTop;
      if (dy === 0) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight; // force reflow so the transform takes effect
      el.style.transition = "transform 130ms cubic-bezier(.2,.7,.3,1)";
      el.style.transform = "";
    }
  }
}

/**
 * Text motion while writing:
 *  - each freshly typed character settles up ~1.5px into place (fluid/minimal)
 *  - reflowing / new lines glide rather than snap (fluid only)
 * Reacts only to real keystrokes; loads, pastes and bulk edits are ignored.
 */
export const TypeMotion = Extension.create({
  name: "typeMotion",

  addProseMirrorPlugins() {
    return [
      new Plugin<MotionState>({
        key,
        state: {
          init: () => ({ items: [], decos: DecorationSet.empty }),
          apply(tr, value, _oldState, newState) {
            if (level() === "none") return { items: [], decos: DecorationSet.empty };
            const now = Date.now();
            const items: Item[] = value.items
              .map((it) => ({
                from: tr.mapping.map(it.from),
                to: tr.mapping.map(it.to),
                at: it.at,
              }))
              .filter((it) => now - it.at < LIFETIME && it.to > it.from);

            const isUserType =
              tr.docChanged && !tr.getMeta("paste") && !tr.getMeta(key);
            if (isUserType) {
              for (const r of insertedRanges(tr)) {
                const len = r.to - r.from;
                if (len <= 0 || len > MAX_RUN) continue;
                // skip spaces / new lines — an inline-block around whitespace
                // would disturb wrapping, and there is no glyph to settle
                const text = newState.doc.textBetween(r.from, r.to, "");
                if (!text.trim()) continue;
                items.push({ ...r, at: now });
              }
            }

            return { items, decos: build(items, newState.doc) };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decos ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          return new ReflowController(editorView);
        },
      }),
    ];
  },
});
