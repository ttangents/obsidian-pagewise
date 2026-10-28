import type { Editor, EditorPosition } from "obsidian";

/**
 * A minimal in-memory stand-in for Obsidian's Editor: the methods Pagewise calls,
 * over an array of lines, with a selection from `anchor` to `head`.
 */
export class FakeEditor {
  lines: string[];
  anchor: EditorPosition;
  head: EditorPosition;

  constructor(text: string, anchor: EditorPosition = { line: 0, ch: 0 }, head: EditorPosition = anchor) {
    this.lines = text.split("\n");
    this.anchor = anchor;
    this.head = head;
  }

  get text(): string {
    return this.lines.join("\n");
  }

  asEditor(): Editor {
    return this as unknown as Editor;
  }

  getCursor(which: "from" | "to" | "head" | "anchor" = "head"): EditorPosition {
    const [from, to] = this.ordered();
    if (which === "from") return from;
    if (which === "to") return to;
    return which === "anchor" ? this.anchor : this.head;
  }
  setCursor(pos: EditorPosition): void {
    this.anchor = this.head = pos;
  }
  getLine(line: number): string {
    return this.lines[line] ?? "";
  }
  lineCount(): number {
    return this.lines.length;
  }
  setLine(line: number, text: string): void {
    this.lines[line] = text;
  }
  getSelection(): string {
    const [from, to] = this.ordered();
    return this.slice(from, to);
  }
  replaceSelection(text: string): void {
    const [from, to] = this.ordered();
    this.replaceRange(text, from, to);
    const inserted = text.split("\n");
    const line = from.line + inserted.length - 1;
    const ch = (inserted.length === 1 ? from.ch : 0) + inserted[inserted.length - 1].length;
    this.setCursor({ line, ch });
  }
  replaceRange(text: string, from: EditorPosition, to: EditorPosition = from): void {
    const all = this.text;
    const start = this.offset(from);
    const end = this.offset(to);
    this.lines = (all.slice(0, start) + text + all.slice(end)).split("\n");
  }

  private ordered(): [EditorPosition, EditorPosition] {
    return this.offset(this.anchor) <= this.offset(this.head) ? [this.anchor, this.head] : [this.head, this.anchor];
  }
  private offset(pos: EditorPosition): number {
    let offset = 0;
    for (let i = 0; i < pos.line; i += 1) offset += this.lines[i].length + 1;
    return offset + pos.ch;
  }
  private slice(from: EditorPosition, to: EditorPosition): string {
    return this.text.slice(this.offset(from), this.offset(to));
  }
}
