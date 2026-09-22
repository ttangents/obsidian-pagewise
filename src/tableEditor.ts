import type { Editor } from "obsidian";
import { isTableLine, parseTable, serializeTable, type TableModel } from "./tableModel";

/**
 * Bridges the editor and the pure table model: finds the table under the
 * cursor, works out which cell the cursor is in, and writes transformed
 * models back as tidy Markdown. Every operation is cursor-anchored and
 * silently a no-op when the cursor is not inside a table.
 */

export interface TableContext {
  /** First column the cursor or selection touches, clamped to the table's width. */
  column: number;
  /** Last column the selection touches; equals column when nothing is selected. */
  columnEnd: number;
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
  const from = clampToBlock(editor.getCursor("from"), startLine, endLine, editor);
  const to = clampToBlock(editor.getCursor("to"), startLine, endLine, editor);
  const columnFrom = columnAt(editor.getLine(from.line), from.ch, model.header.length);
  const columnTo = columnAt(editor.getLine(to.line), to.ch, model.header.length);
  return {
    startLine,
    endLine,
    model,
    context: {
      column: Math.min(columnFrom, columnTo),
      columnEnd: Math.max(columnFrom, columnTo),
      bodyRow: relative >= 2 && relative - 2 < model.rows.length ? relative - 2 : null,
    },
  };
}

/** Clamps a selection endpoint into the table block; an outside endpoint snaps to the block's edge cell. */
function clampToBlock(
  pos: { line: number; ch: number },
  startLine: number,
  endLine: number,
  editor: Editor
): { line: number; ch: number } {
  if (pos.line < startLine) return { line: startLine, ch: 0 };
  if (pos.line > endLine) return { line: endLine, ch: editor.getLine(endLine).length };
  return pos;
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
