/**
 * Pure Markdown table logic. No DOM, no editor: parse a block of lines into a
 * model, transform the model, serialize it back. Serialization always tidies
 * (pads cells and aligns pipes), so every operation leaves clean source behind.
 *
 * Operations return a new model, or null when the request is invalid where the
 * cursor sits (out of range, last remaining column); the caller treats null as
 * a silent no-op. Body rows shorter than the header are padded with empty cells.
 * A row wider than the header keeps its extra cells after the last column, in
 * place, through every operation: GFM does not render them, but they are the
 * user's text, so no edit may delete them.
 */

export type ColumnAlignment = "none" | "left" | "center" | "right";

/** A parsed table: header cells, per-column alignments, body rows, and the source indent. */
export interface TableModel {
  header: string[];
  alignments: ColumnAlignment[];
  /** Body rows: at least the header's width, plus any extra cells the source row had. */
  rows: string[][];
  /** Leading whitespace of the original first line, reapplied to every serialized line. */
  indent: string;
}

/** True when the line can belong to a table block: it contains a pipe. */
export function isTableLine(line: string): boolean {
  return line.includes("|");
}

/** Parses a table block; null unless line 0 is a header and line 1 a delimiter row. */
export function parseTable(lines: string[]): TableModel | null {
  if (lines.length < 2) return null;
  const header = splitCells(lines[0]);
  const alignments = parseDelimiter(lines[1]);
  if (header.length === 0 || alignments === null) return null;
  const width = header.length;
  const rows = lines.slice(2).map((line) => normalizeRow(splitCells(line), width));
  return {
    header,
    alignments: normalizeAlignments(alignments, width),
    rows,
    indent: /^\s*/.exec(lines[0])?.[0] ?? "",
  };
}

/**
 * Serializes with padded cells and aligned pipes; parse + serialize is the tidy
 * operation. Extra cells beyond the header are padded and aligned too.
 */
export function serializeTable(model: TableModel): string[] {
  const rows = model.rows.map((row) => normalizeRow(row, model.header.length));
  const columnCount = Math.max(model.header.length, ...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, col) =>
    Math.max(3, (model.header[col] ?? "").length, ...rows.map((row) => (row[col] ?? "").length))
  );
  const line = (cells: string[]): string =>
    `${model.indent}| ${cells.map((cell, col) => cell.padEnd(widths[col])).join(" | ")} |`;
  const delimiter = model.alignments.map((alignment, col) => delimiterCell(alignment, widths[col]));
  return [line(model.header), line(delimiter), ...rows.map(line)];
}

/** Sets the alignment of every column from startColumn to endColumn inclusive. */
export function setAlignment(
  model: TableModel,
  startColumn: number,
  endColumn: number,
  alignment: ColumnAlignment
): TableModel | null {
  const start = Math.min(startColumn, endColumn);
  const end = Math.max(startColumn, endColumn);
  if (!validColumn(model, start) || !validColumn(model, end)) return null;
  const alignments = model.alignments.map((existing, column) =>
    column >= start && column <= end ? alignment : existing
  );
  return { ...model, alignments };
}

/** Inserts a blank body row at the given index (clamped into the body). */
export function insertRow(model: TableModel, index: number): TableModel {
  const at = clamp(index, 0, model.rows.length);
  const rows = [...model.rows];
  rows.splice(at, 0, new Array<string>(model.header.length).fill(""));
  return { ...model, rows };
}

/** Inserts a blank column at the given index (clamped), with default alignment. */
export function insertColumn(model: TableModel, index: number): TableModel {
  const at = clamp(index, 0, model.header.length);
  const header = [...model.header];
  header.splice(at, 0, "");
  const alignments = [...model.alignments];
  alignments.splice(at, 0, "none");
  const rows = model.rows.map((row) => {
    const next = [...row];
    next.splice(at, 0, "");
    return next;
  });
  return { ...model, header, alignments, rows };
}

/** Removes the body row at index; null when the index is outside the body. */
export function deleteRow(model: TableModel, index: number): TableModel | null {
  if (index < 0 || index >= model.rows.length) return null;
  return { ...model, rows: model.rows.filter((_, i) => i !== index) };
}

/** Refuses to delete the last column; that is what deleting the table is for. */
export function deleteColumn(model: TableModel, column: number): TableModel | null {
  if (!validColumn(model, column) || model.header.length <= 1) return null;
  return {
    ...model,
    header: model.header.filter((_, i) => i !== column),
    alignments: model.alignments.filter((_, i) => i !== column),
    rows: model.rows.map((row) => row.filter((_, i) => i !== column)),
  };
}

/** Moves the row at index by delta rows; null when either position falls outside the body. */
export function moveRow(model: TableModel, index: number, delta: number): TableModel | null {
  const target = index + delta;
  if (index < 0 || index >= model.rows.length || target < 0 || target >= model.rows.length) return null;
  const rows = [...model.rows];
  const [moved] = rows.splice(index, 1);
  rows.splice(target, 0, moved);
  return { ...model, rows };
}

/** Moves the column at column by delta columns, header and every row together; null when either position is out of range. */
export function moveColumn(model: TableModel, column: number, delta: number): TableModel | null {
  const target = column + delta;
  if (!validColumn(model, column) || target < 0 || target >= model.header.length) return null;
  const move = <T>(cells: T[]): T[] => {
    const next = [...cells];
    const [moved] = next.splice(column, 1);
    next.splice(target, 0, moved);
    return next;
  };
  return {
    ...model,
    header: move(model.header),
    alignments: move(model.alignments),
    rows: model.rows.map(move),
  };
}

/** Copies the body row at index directly below it; null when the index is outside the body. */
export function duplicateRow(model: TableModel, index: number): TableModel | null {
  if (index < 0 || index >= model.rows.length) return null;
  const rows = [...model.rows];
  rows.splice(index + 1, 0, [...model.rows[index]]);
  return { ...model, rows };
}

/** Stable sort of the body rows by one column: numeric when both cells are numbers, text otherwise. */
export function sortRows(model: TableModel, column: number, ascending: boolean): TableModel | null {
  if (!validColumn(model, column)) return null;
  const rows = [...model.rows].sort((a, b) => {
    const order = compareCells(a[column] ?? "", b[column] ?? "");
    return ascending ? order : -order;
  });
  return { ...model, rows };
}

/**
 * Swaps rows and columns. The header row becomes the first column and the first
 * column becomes the header row, which keeps label semantics on both axes.
 * Alignments do not survive the axis swap and reset to default. Extra cells
 * beyond the header become cells of new, unlabelled rows, so none is lost.
 */
export function transpose(model: TableModel): TableModel {
  const width = Math.max(model.header.length, ...model.rows.map((row) => row.length));
  const labels = normalizeRow(model.header, width);
  const header = [labels[0] ?? "", ...model.rows.map((row) => row[0] ?? "")];
  const rows = labels.slice(1).map((label, i) => [label, ...model.rows.map((row) => row[i + 1] ?? "")]);
  return {
    ...model,
    header,
    alignments: new Array<ColumnAlignment>(header.length).fill("none"),
    rows,
  };
}

/** Splits a table line into trimmed cells, honoring escaped pipes and optional outer pipes. */
function splitCells(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "\\" && body[i + 1] === "|") {
      current += "\\|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Reads the delimiter row; null when any cell is not a run of dashes with optional colons. */
function parseDelimiter(line: string): ColumnAlignment[] | null {
  const cells = splitCells(line);
  const alignments: ColumnAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    alignments.push(left && right ? "center" : left ? "left" : right ? "right" : "none");
  }
  return alignments;
}

function delimiterCell(alignment: ColumnAlignment, width: number): string {
  switch (alignment) {
    case "left":
      return `:${"-".repeat(width - 1)}`;
    case "right":
      return `${"-".repeat(width - 1)}:`;
    case "center":
      return `:${"-".repeat(width - 2)}:`;
    default:
      return "-".repeat(width);
  }
}

/**
 * Pads a row to the header's width. Cells beyond it are kept; only trailing empty
 * ones are dropped, since they hold no text.
 */
function normalizeRow(cells: string[], width: number): string[] {
  const row = [...cells];
  while (row.length > width && row[row.length - 1] === "") row.pop();
  while (row.length < width) row.push("");
  return row;
}

function normalizeAlignments(alignments: ColumnAlignment[], width: number): ColumnAlignment[] {
  const next = alignments.slice(0, width);
  while (next.length < width) next.push("none");
  return next;
}

function compareCells(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  return a.localeCompare(b);
}

function validColumn(model: TableModel, column: number): boolean {
  return column >= 0 && column < model.header.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
