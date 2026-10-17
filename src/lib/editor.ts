import { basicSetup } from "codemirror";
import { EditorState, Prec, type Range, type TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { indentWithTab } from "@codemirror/commands";
import { tags } from "@lezer/highlight";

export type ToolbarAction = "Bold" | "Italic" | "Heading" | "Bullet list" | "Numbered list" | "Quote" | "Inline code" | "Code block" | "Link";

export function formatMarkdown(state: EditorState, action: ToolbarAction): TransactionSpec {
  const { from, to } = state.selection.main;
  const wrappers: Partial<Record<ToolbarAction, [string, string]>> = {
    Bold: ["**", "**"], Italic: ["*", "*"], "Inline code": ["`", "`"],
    "Code block": ["```\n", "\n```"], Link: ["[", "](https://)"],
  };
  const wrap = wrappers[action];
  if (wrap) {
    const [before, after] = wrap;
    if (from >= before.length && state.sliceDoc(from - before.length, from) === before && state.sliceDoc(to, to + after.length) === after) {
      return { changes: [{ from: from - before.length, to: from, insert: "" }, { from: to, to: to + after.length, insert: "" }], selection: { anchor: from - before.length, head: to - before.length } };
    }
    return { changes: { from, to, insert: before + state.sliceDoc(from, to) + after }, selection: { anchor: from + before.length, head: to + before.length } };
  }
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to);
  const prefix = action === "Heading" ? "## " : action === "Bullet list" ? "- " : action === "Numbered list" ? "1. " : "> ";
  const lines = [];
  for (let number = first.number; number <= last.number; number++) lines.push(state.doc.line(number));
  const prefixes = lines.map((line) => action === "Numbered list" ? line.text.match(/^\d+\. /)?.[0] ?? "" : line.text.startsWith(prefix) ? prefix : "");
  const remove = prefixes.every(Boolean);
  return { changes: lines.map((line, index) => ({ from: line.from, to: line.from + (remove ? prefixes[index].length : 0), insert: remove ? "" : action === "Numbered list" ? `${index + 1}. ` : prefix })) };
}

class ListMarker extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: ListMarker) { return this.text === other.text; }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-preview-marker";
    marker.textContent = this.text;
    return marker;
  }
  ignoreEvent() { return false; }
}

export function previewDecorations(state: EditorState, ranges: readonly { from: number; to: number }[] = [{ from: 0, to: state.doc.length }]): DecorationSet {
  const cursorLines = state.selection.ranges.map((range) => state.doc.lineAt(range.head).number);
  const decorations: Range<Decoration>[] = [];
  const lineClasses = new Map<number, Set<string>>();
  const orderedNumbers = new Map<number, number>();
  function styleLine(from: number, className: string) {
    const classes = lineClasses.get(from) ?? new Set<string>();
    classes.add(className);
    lineClasses.set(from, classes);
  }
  for (const range of ranges) {
    syntaxTree(state).iterate({ from: range.from, to: range.to, enter(node) {
      if (node.name === "Blockquote") {
        const last = state.doc.lineAt(Math.min(node.to, range.to)).number;
        for (let number = state.doc.lineAt(Math.max(node.from, range.from)).number; number <= last; number++) {
          styleLine(state.doc.line(number).from, "cm-preview-quote");
        }
      }
      const line = state.doc.lineAt(node.from);
      const active = cursorLines.includes(line.number);
      if (/^ATXHeading[1-6]$/.test(node.name)) styleLine(line.from, `cm-preview-h${node.name.slice(-1)}`);
      const from = node.from;
      let to = node.to;
      if (node.name === "HeaderMark" || node.name === "QuoteMark") {
        if (active) return;
        if (node.name === "QuoteMark" || node.from === node.node.parent?.from) {
          while (to < line.to && /[ \t]/.test(state.sliceDoc(to, to + 1))) to++;
        }
        decorations.push(Decoration.replace({}).range(from, to));
      } else if (node.name === "ListMark") {
        styleLine(line.from, "cm-preview-list");
        while (to < line.to && /[ \t]/.test(state.sliceDoc(to, to + 1))) to++;
        if (active) {
          decorations.push(Decoration.mark({ class: "cm-preview-marker" }).range(from, to));
          return;
        }
        let text = "•";
        const list = node.node.parent?.parent;
        if (list?.name === "OrderedList") {
          if (!orderedNumbers.has(node.from)) {
            let number: number | undefined;
            for (let item = list.firstChild; item; item = item.nextSibling) {
              const mark = item.getChild("ListMark");
              if (mark) {
                number ??= Number.parseInt(state.sliceDoc(mark.from, mark.to), 10);
                orderedNumbers.set(mark.from, number++);
              }
            }
          }
          text = `${orderedNumbers.get(node.from)}.`;
        }
        decorations.push(Decoration.replace({ widget: new ListMarker(text) }).range(from, to));
      } else if (!active && (node.name === "EmphasisMark" || (node.name === "CodeMark" && node.node.parent?.name === "InlineCode"))) {
        decorations.push(Decoration.replace({}).range(from, to));
      }
    } });
  }
  for (const [from, classes] of lineClasses) decorations.push(Decoration.line({ class: [...classes].join(" ") }).range(from));
  return Decoration.set(decorations, true);
}

const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = previewDecorations(view.state, view.visibleRanges); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = previewDecorations(update.state, update.view.visibleRanges);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

export interface PageEditor {
  destroy(): void;
  getValue(): string;
  setContent(content: string): void;
  focus(): void;
  action(action: ToolbarAction): void;
}

export function createEditor(parent: HTMLElement, content: string, onChange: (content: string) => void): PageEditor {
  let settingContent = false;
  const command = (action: ToolbarAction) => (view: EditorView) => { view.dispatch(formatMarkdown(view.state, action)); return true; };
  const view = new EditorView({ parent, doc: content, extensions: [
    basicSetup, markdown(), livePreview, EditorView.lineWrapping,
    Prec.high(keymap.of([{ key: "Mod-b", run: command("Bold") }, { key: "Mod-i", run: command("Italic") }, indentWithTab])),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading, color: "var(--accent-text)", fontWeight: "600" },
      { tag: tags.strong, fontWeight: "700" }, { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.monospace, color: "var(--accent-text)", backgroundColor: "var(--accent-soft)" },
      { tag: tags.link, color: "var(--accent-text)", textDecoration: "underline" },
      { tag: tags.processingInstruction, color: "var(--sub)" },
    ])),
    EditorView.theme({
      "&": { height: "100%", color: "var(--text)", backgroundColor: "#18191c" },
      ".cm-scroller": { overflow: "auto", fontFamily: "var(--app-font)", lineHeight: "1.7" },
      ".cm-content": { padding: "18px", caretColor: "var(--text)" },
      ".cm-gutters": { display: "none" },
      ".cm-activeLine": { backgroundColor: "var(--accent-soft)" },
      ".cm-preview-h1": { fontSize: "2em", fontWeight: "700", lineHeight: "1.3", paddingTop: "8px", paddingBottom: "8px" },
      ".cm-preview-h2": { fontSize: "1.6em", fontWeight: "600", lineHeight: "1.35", paddingTop: "6px", paddingBottom: "6px" },
      ".cm-preview-h3": { fontSize: "1.3em", fontWeight: "600" },
      ".cm-preview-h4, .cm-preview-h5, .cm-preview-h6": { fontSize: "1.1em", fontWeight: "600" },
      ".cm-preview-list": { paddingLeft: "1.5em", textIndent: "-1.5em" },
      ".cm-preview-marker": { display: "inline-block", minWidth: "1.5em", textIndent: "0", color: "var(--sub)" },
      ".cm-preview-quote": { borderLeft: "3px solid var(--accent)", paddingLeft: "12px", backgroundColor: "var(--accent-soft)", color: "var(--sub)" },
      ".cm-preview-quote.cm-preview-list": { paddingLeft: "calc(12px + 1.5em)" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft)" },
    }, { dark: true }),
    EditorView.contentAttributes.of({ "aria-label": "Page notes" }),
    EditorView.updateListener.of((update) => { if (update.docChanged && !settingContent) onChange(update.state.doc.toString()); }),
  ] });
  return {
    destroy: () => view.destroy(), getValue: () => view.state.doc.toString(), focus: () => view.focus(),
    setContent(content) {
      settingContent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: { anchor: 0 } });
      settingContent = false;
    },
    action(action) { command(action)(view); view.focus(); },
  };
}
