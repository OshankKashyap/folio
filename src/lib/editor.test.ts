import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { formatMarkdown, previewDecorations, type ToolbarAction } from "./editor";

describe("markdown formatting", () => {
  it.each<[ToolbarAction, string]>([["Bold", "**text**"], ["Italic", "*text*"], ["Inline code", "`text`"], ["Code block", "```\ntext\n```"], ["Link", "[text](https://)"]])("wraps and toggles %s while preserving the selected text", (action, expected) => {
    const state = EditorState.create({ doc: "text", selection: { anchor: 0, head: 4 } });
    const wrapped = state.update(formatMarkdown(state, action)).state;
    expect(wrapped.doc.toString()).toBe(expected);
    expect(wrapped.sliceDoc(wrapped.selection.main.from, wrapped.selection.main.to)).toBe("text");
    expect(wrapped.update(formatMarkdown(wrapped, action)).state.doc.toString()).toBe("text");
  });

  it.each<[ToolbarAction, string]>([["Heading", "## "], ["Bullet list", "- "], ["Numbered list", "1. "], ["Quote", "> "]])("prefixes and toggles selected lines with %s", (action, prefix) => {
    const state = EditorState.create({ doc: "first\nsecond", selection: { anchor: 0, head: 12 } });
    const changed = state.update(formatMarkdown(state, action)).state;
    expect(changed.doc.toString()).toBe(`${prefix}first\n${action === "Numbered list" ? "2. " : prefix}second`);
    const selected = changed.update({ selection: { anchor: 0, head: changed.doc.length } }).state;
    expect(selected.update(formatMarkdown(selected, action)).state.doc.toString()).toBe("first\nsecond");
  });

  it("inserts empty marks at the cursor and does not format the line after a selection ending at its start", () => {
    let state = EditorState.create({ doc: "" });
    state = state.update(formatMarkdown(state, "Bold")).state;
    expect(state.doc.toString()).toBe("****");
    expect(state.selection.main.head).toBe(2);
    state = EditorState.create({ doc: "first\nsecond", selection: { anchor: 0, head: 6 } });
    expect(state.update(formatMarkdown(state, "Quote")).state.doc.toString()).toBe("> first\nsecond");
  });
});

describe("live preview decorations", () => {
  function hidden(state: EditorState) {
    const marks: string[] = [];
    previewDecorations(state).between(0, state.doc.length, (from, to) => { marks.push(state.sliceDoc(from, to)); });
    return marks;
  }

  it("hides simple inline marks off the cursor line and swaps instantly on cursor movement", () => {
    const state = EditorState.create({ doc: "**bold**\n*italic* and `code`\nplain", selection: { anchor: 0 }, extensions: [markdown()] });
    expect(hidden(state)).toEqual(["*", "*", "`", "`"]);
    const moved = state.update({ selection: { anchor: 10 } }).state;
    expect(hidden(moved)).toEqual(["**", "**"]);
    expect(hidden(state.update({ selection: { anchor: state.doc.length } }).state)).toEqual(["**", "**", "*", "*", "`", "`"]);
  });

  it("leaves escaped marks, fenced code and malformed markdown literal", () => {
    const state = EditorState.create({ doc: "cursor\n\\*literal\\*\n```\n**code**\n```\n**unclosed", extensions: [markdown()] });
    expect(hidden(state)).toEqual([]);
  });

  function preview(state: EditorState, ranges?: { from: number; to: number }[]) {
    const lines: { number: number; classes: string }[] = [];
    const replacements: { source: string; text: string | null }[] = [];
    previewDecorations(state, ranges).between(0, state.doc.length, (from, to, decoration) => {
      if (from === to) {
        lines.push({ number: state.doc.lineAt(from).number, classes: decoration.spec.class });
      } else if (decoration.spec.class !== "cm-preview-marker") {
        const widget = decoration.spec.widget;
        if (widget) expect(widget.ignoreEvent()).toBe(false);
        replacements.push({ source: state.sliceDoc(from, to), text: widget ? widget.toDOM().textContent : null });
      }
    });
    return { lines, replacements };
  }

  it.each([1, 2, 3, 4, 5, 6])("renders H%i headings without their opening and closing marks off the cursor line", (level) => {
    const marks = "#".repeat(level);
    const state = EditorState.create({ doc: `cursor\n${marks} Heading ${marks}`, extensions: [markdown()] });
    expect(preview(state)).toEqual({
      lines: [{ number: 2, classes: `cm-preview-h${level}` }],
      replacements: [{ source: `${marks} `, text: null }, { source: marks, text: null }],
    });
    const moved = state.update({ selection: { anchor: state.doc.length } }).state;
    expect(preview(moved)).toEqual({ lines: [{ number: 2, classes: `cm-preview-h${level}` }], replacements: [] });
    expect(moved.doc.toString()).toBe(state.doc.toString());
  });

  it("renders bullet markers and ordered numbering with hanging list styling", () => {
    const state = EditorState.create({ doc: "cursor\n- first\n  * nested\n\n3) third\n1) fourth", extensions: [markdown()] });
    expect(preview(state)).toEqual({
      lines: [2, 3, 5, 6].map((number) => ({ number, classes: "cm-preview-list" })),
      replacements: [{ source: "- ", text: "•" }, { source: "* ", text: "•" }, { source: "3) ", text: "3." }, { source: "1) ", text: "4." }],
    });
    const moved = state.update({ selection: { anchor: state.doc.line(2).from } }).state;
    expect(preview(moved).lines).toEqual(preview(state).lines);
    expect(preview(moved).replacements.some((mark) => mark.source === "- ")).toBe(false);
  });

  it("styles entire quote blocks including lazy continuation lines, while keeping the cursor line raw", () => {
    const state = EditorState.create({ doc: "cursor\n> quoted\ncontinued\n> last", extensions: [markdown()] });
    expect(preview(state)).toEqual({
      lines: [2, 3, 4].map((number) => ({ number, classes: "cm-preview-quote" })),
      replacements: [{ source: "> ", text: null }, { source: "> ", text: null }],
    });
    const moved = state.update({ selection: { anchor: state.doc.line(4).from } }).state;
    expect(preview(moved)).toEqual({
      lines: [2, 3, 4].map((number) => ({ number, classes: "cm-preview-quote" })),
      replacements: [{ source: "> ", text: null }],
    });
  });

  it("combines block styling with inline preview, but does not render syntax inside fenced code", () => {
    const state = EditorState.create({ doc: "cursor\n> ## **Heading**\n> - `item`\n\n```md\n## literal\n- literal\n> literal\n```", extensions: [markdown()] });
    const result = preview(state);
    expect(result.lines).toEqual([{ number: 2, classes: "cm-preview-quote cm-preview-h2" }, { number: 3, classes: "cm-preview-quote cm-preview-list" }]);
    expect(result.replacements.map((mark) => mark.source)).toEqual(["> ", "## ", "**", "**", "> ", "- ", "`", "`"]);
  });

  it("limits long quote block decorations to the visible range", () => {
    const state = EditorState.create({ doc: "cursor\n> first\n> second\n> third", extensions: [markdown()] });
    const line = state.doc.line(3);
    expect(preview(state, [{ from: line.from, to: line.to }])).toEqual({
      lines: [{ number: 3, classes: "cm-preview-quote" }],
      replacements: [{ source: "> ", text: null }],
    });
  });

  it("keeps empty heading replacements disjoint and numbers visible list items from the list start", () => {
    const state = EditorState.create({ doc: "cursor\n## ##\n\n3. first\n1. second", extensions: [markdown()] });
    expect(preview(state).replacements.slice(0, 2)).toEqual([{ source: "## ", text: null }, { source: "##", text: null }]);
    const line = state.doc.line(5);
    expect(preview(state, [{ from: line.from, to: line.to }]).replacements).toEqual([{ source: "1. ", text: "4." }]);
  });

  it.each(["- ", "1. ", "12) "])("gives the editable %s marker the same alignment class as its preview widget", (prefix) => {
    const state = EditorState.create({ doc: `${prefix}item\nplain`, extensions: [markdown()] });
    const sourceMarkers: string[] = [];
    previewDecorations(state).between(0, state.doc.length, (from, to, decoration) => {
      if (decoration.spec.class === "cm-preview-marker") sourceMarkers.push(state.sliceDoc(from, to));
    });
    expect(sourceMarkers).toEqual([prefix]);
    const moved = state.update({ selection: { anchor: state.doc.length } }).state;
    expect(preview(moved).lines).toEqual(preview(state).lines);
    let widgetClass = "";
    previewDecorations(moved).between(0, moved.doc.length, (_from, _to, decoration) => {
      if (decoration.spec.widget) widgetClass = decoration.spec.widget.toDOM().className;
    });
    expect(widgetClass).toBe("cm-preview-marker");
    expect(moved.doc.toString()).toBe(state.doc.toString());
  });

  it("keeps combined heading, quote and list styling stable when moving between lines", () => {
    const state = EditorState.create({ doc: "> ## Heading\n> - **item**\nplain", extensions: [markdown()] });
    const moved = state.update({ selection: { anchor: state.doc.line(2).from } }).state;
    const plain = state.update({ selection: { anchor: state.doc.length } }).state;
    expect(preview(state).lines).toEqual(preview(plain).lines);
    expect(preview(moved).lines).toEqual(preview(plain).lines);
    expect(preview(state).replacements.map((mark) => mark.source)).not.toContain("## ");
    expect(preview(moved).replacements.map((mark) => mark.source)).not.toContain("**");
    expect(preview(plain).replacements.map((mark) => mark.source)).toContain("**");
  });
});
