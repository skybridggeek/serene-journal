import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import { Icon } from "../components/Shared";
import { SlashMenu, type SlashItem } from "./SlashMenu";

interface SlashOptions {
  onPickImage: () => void;
}

function getItems(onPickImage: () => void): SlashItem[] {
  const cmd =
    (fn: (chain: Editor, range: Range) => void) =>
    ({ editor, range }: { editor: Editor; range: Range }) =>
      fn(editor, range);
  return [
    {
      title: "Heading",
      desc: "Section title",
      keywords: ["heading", "title", "h2"],
      icon: <span className="slash-glyph">H</span>,
      command: cmd((editor, range) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
      ),
    },
    {
      title: "Bullet list",
      desc: "Simple bulleted list",
      keywords: ["bullet", "list", "unordered"],
      icon: <span className="slash-glyph">•≡</span>,
      command: cmd((editor, range) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      ),
    },
    {
      title: "Numbered list",
      desc: "Ordered list",
      keywords: ["numbered", "ordered", "list"],
      icon: <span className="slash-glyph">1.</span>,
      command: cmd((editor, range) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      ),
    },
    {
      title: "Quote",
      desc: "A highlighted passage",
      keywords: ["quote", "blockquote"],
      icon: <span className="slash-glyph">”</span>,
      command: cmd((editor, range) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run()
      ),
    },
    {
      title: "Divider",
      desc: "Horizontal line",
      keywords: ["divider", "separator", "hr", "line"],
      icon: <span className="slash-glyph">—</span>,
      command: cmd((editor, range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setHorizontalRule()
          .run()
      ),
    },
    {
      title: "Image",
      desc: "Add a photo from your device",
      keywords: ["image", "photo", "picture"],
      icon: <span className="slash-glyph slash-glyph-icon">{Icon.Camera}</span>,
      command: cmd((editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        onPickImage();
      }),
    },
  ];
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: "slashCommands",

  addOptions() {
    return { onPickImage: () => {} };
  },

  addProseMirrorPlugins() {
    const onPickImage = this.options.onPickImage;
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return getItems(onPickImage)
            .filter(
              (i) =>
                i.title.toLowerCase().includes(q) ||
                i.keywords.some((k) => k.includes(q))
            )
            .slice(0, 6);
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => {
          props.command({ editor, range });
        },
        render: () => {
          let renderer: ReactRenderer<{ onKeyDown: (e: KeyboardEvent) => boolean }> | null =
            null;
          let popup: Instance | null = null;

          const destroy = () => {
            popup?.destroy();
            popup = null;
            renderer?.destroy();
            renderer = null;
          };

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              renderer = new ReactRenderer(SlashMenu, {
                props: props as object,
                editor: props.editor,
              });
              popup = tippy(document.body, {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                appendTo: () => document.body,
                content: renderer.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                animation: false,
                hideOnClick: false,
              });
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
              renderer?.updateProps(props as object);
              popup?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
              });
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                destroy();
                return true;
              }
              return renderer?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: destroy,
          };
        },
      }),
    ];
  },
});
