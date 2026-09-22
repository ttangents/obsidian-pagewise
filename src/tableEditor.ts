import type { Editor } from "obsidian";
import { isTableLine, parseTable, serializeTable, type TableModel } from "./tableModel";

/**
 * Bridges the editor and the pure table model: finds the table under the
 * cursor, works out which cell the cursor is in, and writes transformed
 * models back as tidy Markdown. Every operation is cursor-anchored and
 * silently a no-op when the cursor is not inside a table.
 */

export interface TableContext {
  /** Column the cursor is in, clamped to the table's width. */
  column: number;
  /** Index into the body rows, or null when the cursor sits on the header or delimiter line. */
  bodyRow: number | null;
}

export interface LocatedTable {
  startLine: number;
  endLine: number;
  model: TableModel;
  context: TableContext;
}

/** Finds the table block under the cursor by expanding over contiguous table lines. */
export function locateTable(editor: Editor): LocatedTable | null {
  const cursor = editor.getCursor();
  if (!isTableLine(editor.getLine(cursor.line))) return null;
  let startLine = cursor.line;
  while (startLine > 0 && isTableLine(editor.getLine(startLine - 1))) startLine -= 1;
  let endLine = cursor.line;
  while (endLine < editor.lineCount() - 1 && isTableLine(editor.getLine(endLine + 1))) endLine += 1;
  const lines: string[] = [];
  for (let line = startLine; line <= endLine; line += 1) lines.push(editor.getLine(line));
  const model = parseTable(lines);
  if (!model) return null;
  const relative = cursor.line - startLine;
  return {
    startLine,
    endLine,
    model,
    context: {
      column: columnAt(editor.getLine(cursor.line), cursor.ch, model.header.length),
      bodyRow: relative >= 2 && relative - 2 < model.rows.length ? relative - 2 : null,
    },
  };
}

/**
 * Applies one model transformation to the table under the cursor and rewrites
 * it in place. A null result from the transform (invalid where the cursor sits)
 * leaves the document untouched.
 */
export function applyTableEdit(
  editor: Editor,
  transform: (model: TableModel, context: TableContext) => TableModel | null
): void {
  const located = locateTable(editor);
  if (!located) return;
  const next = transform(located.model, located.context);
  if (!next) return;
  replaceTable(editor, located, serializeTable(next));
}

/** Removes the whole table under the cursor, leaving the cursor on the line that follows it. */
export function deleteTable(editor: Editor): void {
  const located = locateTable(editor);
  if (!located) return;
  const afterEnd = located.endLine < editor.lineCount() - 1;
  editor.replaceRange(
    "",
    { line: located.startLine, ch: 0 },
    afterEnd
      ? { line: located.endLine + 1, ch: 0 }
      : { line: located.endLine, ch: editor.getLine(located.endLine).length }
  );
  editor.setCursor({ line: Math.min(located.startLine, editor.lineCount() - 1), ch: 0 });
}

function replaceTable(editor: Editor, located: LocatedTable, lines: string[]): void {
  const cursor = editor.getCursor();
  editor.replaceRange(
    lines.join("\n"),
    { line: located.startLine, ch: 0 },
    { line: located.endLine, ch: editor.getLine(located.endLine).length }
  );
  const line = Math.min(cursor.line, located.startLine + lines.length - 1);
  editor.setCursor({ line, ch: Math.min(cursor.ch, editor.getLine(line).length) });
}

/** Which column the character offset falls in: unescaped pipes before it, minus any leading pipe. */
function columnAt(lineText: string, ch: number, columnCount: number): number {
  const before = lineText.slice(0, ch);
  let pipes = 0;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === "\\") {
      i += 1;
      continue;
    }
    if (before[i] === "|") pipes += 1;
  }
  const leadingPipe = /^\s*\|/.test(lineText) ? 1 : 0;
  return Math.max(0, Math.min(columnCount - 1, pipes - leadingPipe));
}
