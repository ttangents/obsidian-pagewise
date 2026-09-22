"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PagewisePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/controller.ts
var import_obsidian = require("obsidian");

// src/layoutEngine.ts
function planLayout({ blocks, contentHeight, breakHeight }) {
  const breaksBefore = new Array(blocks.length).fill(0);
  let shift = 0;
  let pageStart = 0;
  let lastBottom = 0;
  blocks.forEach((block, index) => {
    const top = block.top + shift;
    const offsetOnPage = top - pageStart;
    const overflows = offsetOnPage + block.height > contentHeight;
    const canBreak = offsetOnPage > 0;
    if (overflows && canBreak) {
      const fill = contentHeight - offsetOnPage;
      const spacer = fill + breakHeight;
      breaksBefore[index] = spacer;
      shift += spacer;
      pageStart = top + spacer;
      lastBottom = pageStart + block.height;
      return;
    }
    lastBottom = top + block.height;
  });
  const usedOnLastPage = lastBottom - pageStart;
  const tailPadding = usedOnLastPage > 0 ? Math.max(0, contentHeight - (usedOnLastPage % contentHeight || contentHeight)) : contentHeight;
  return { breaksBefore, tailPadding };
}

// src/paginator.ts
var BREAK_CLASS = "pagewise-break";
var TAIL_CLASS = "pagewise-tail";
var Paginator = class {
  constructor(sizer) {
    this.sizer = sizer;
  }
  /** Measures the natural layout, computes breaks, and writes spacers into the DOM. */
  apply(metrics) {
    this.clear();
    const blocks = this.blockElements();
    if (blocks.length === 0) return;
    const origin = this.sizer.getBoundingClientRect().top + this.contentInset();
    const geometry = blocks.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top - origin, height: rect.height };
    });
    const plan = planLayout({
      blocks: geometry,
      contentHeight: metrics.contentHeightPx,
      breakHeight: 2 * metrics.marginPx + metrics.gapPx
    });
    let page = 0;
    plan.breaksBefore.forEach((height, index) => {
      if (height <= 0) return;
      page += 1;
      const spacer = createSpacer(BREAK_CLASS, height, page);
      blocks[index].before(spacer);
    });
    this.sizer.append(createSpacer(TAIL_CLASS, plan.tailPadding, page + 1));
  }
  /** Removes every spacer this paginator inserted. */
  clear() {
    this.sizer.querySelectorAll(`:scope > .${BREAK_CLASS}, :scope > .${TAIL_CLASS}`).forEach((el) => el.remove());
  }
  blockElements() {
    return Array.from(this.sizer.children).filter(
      (el) => el instanceof HTMLElement && !el.classList.contains(BREAK_CLASS) && !el.classList.contains(TAIL_CLASS)
    );
  }
  /** Top padding of the sizer, which is the page's top margin once Pagewise styling is active. */
  contentInset() {
    return parseFloat(getComputedStyle(this.sizer).paddingTop) || 0;
  }
};
function createSpacer(className, height, pageNumber) {
  const spacer = document.createElement("div");
  spacer.className = className;
  spacer.style.height = `${height}px`;
  spacer.dataset.page = String(pageNumber);
  return spacer;
}

// src/propertiesCollapser.ts
var CONTAINER_SELECTOR = ".metadata-container";
var COLLAPSED_CLASS = "is-collapsed";
var INDICATOR_SELECTOR = ".metadata-properties-heading .collapse-indicator";
var PropertiesCollapser = class {
  constructor() {
    /** Containers this collapser collapsed, so only those are expanded on restore. */
    this.collapsedByUs = /* @__PURE__ */ new WeakSet();
    /** Containers seen since activation, so a user's manual re-expand is not undone. */
    this.seen = /* @__PURE__ */ new WeakSet();
  }
  /**
   * Collapses every not-yet-seen properties panel in the given views. Idempotent.
   * @returns true when at least one panel changed state in this call.
   */
  collapse(views) {
    let changed = false;
    for (const view of views) {
      for (const container of findContainers(view)) {
        if (this.seen.has(container)) continue;
        this.seen.add(container);
        if (container.classList.contains(COLLAPSED_CLASS)) continue;
        setCollapsed(view, container, true);
        this.collapsedByUs.add(container);
        changed = true;
      }
    }
    return changed;
  }
  /**
   * Forgets that panels in the given views were seen, without touching their state.
   * Obsidian reuses the metadata element across file switches in the same pane, so the
   * controller calls this on file-open to let the next collapse() apply to the new note.
   */
  forget(views) {
    for (const view of views) {
      for (const container of findContainers(view)) {
        this.seen.delete(container);
        this.collapsedByUs.delete(container);
      }
    }
  }
  /** Re-expands only the panels this collapser collapsed and forgets all tracked state. */
  restore(views) {
    for (const view of views) {
      for (const container of findContainers(view)) {
        if (this.collapsedByUs.has(container)) setCollapsed(view, container, false);
        this.collapsedByUs.delete(container);
        this.seen.delete(container);
      }
    }
  }
};
function findContainers(view) {
  return Array.from(view.containerEl.querySelectorAll(CONTAINER_SELECTOR));
}
function setCollapsed(view, container, collapsed) {
  const editor = view.metadataEditor;
  if (container.closest(".markdown-source-view") && typeof editor?.setCollapse === "function") {
    editor.setCollapse(collapsed, false);
    return;
  }
  container.classList.toggle(COLLAPSED_CLASS, collapsed);
  container.querySelector(INDICATOR_SELECTOR)?.classList.toggle(COLLAPSED_CLASS, collapsed);
}

// src/pageSizes.ts
var PX_PER_INCH = 96;
var PX_PER_MM = PX_PER_INCH / 25.4;
var PAGE_SIZES = [
  { id: "a4", label: "A4 (210 \xD7 297 mm)", widthMm: 210, heightMm: 297 },
  { id: "a5", label: "A5 (148 \xD7 210 mm)", widthMm: 148, heightMm: 210 },
  { id: "letter", label: "US Letter (8.5 \xD7 11 in)", widthMm: 215.9, heightMm: 279.4 },
  { id: "legal", label: "US Legal (8.5 \xD7 14 in)", widthMm: 215.9, heightMm: 355.6 }
];
function pageSizeById(id) {
  return PAGE_SIZES.find((size) => size.id === id) ?? PAGE_SIZES[0];
}
function resolveMetrics(size, marginMm, gapPx) {
  const marginPx = marginMm * PX_PER_MM;
  const pageHeightPx = size.heightMm * PX_PER_MM;
  return {
    pageWidthPx: size.widthMm * PX_PER_MM,
    pageHeightPx,
    marginPx,
    gapPx,
    contentHeightPx: pageHeightPx - 2 * marginPx
  };
}

// src/controller.ts
var ACTIVE_CLASS = "pagewise-active";
var HIDE_PROPS_CLASS = "pagewise-props-hidden";
var SIZER_SELECTOR = ".markdown-preview-sizer";
var RELAYOUT_DELAY_MS = 120;
var PaginationController = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.active = /* @__PURE__ */ new Set();
    this.paginators = /* @__PURE__ */ new WeakMap();
    this.observers = /* @__PURE__ */ new Map();
    this.properties = new PropertiesCollapser();
    this.suspended = false;
    this.pendingFrame = null;
    this.metrics = metricsFrom(settings);
    this.publishGeometry();
    this.relayout = (0, import_obsidian.debounce)(() => this.layoutActiveViews(), RELAYOUT_DELAY_MS, true);
  }
  /** Toggles the paginated view for the note in focus; a no-op outside Markdown panes. */
  toggleActiveView() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view) {
      new import_obsidian.Notice("Pagewise: no active note to paginate.");
      return;
    }
    this.active.has(view) ? this.deactivate(view) : this.activate(view);
  }
  /** Re-reads geometry from new settings, syncs global scope, and re-applies active panes. */
  applySettings(settings) {
    this.settings = settings;
    this.metrics = metricsFrom(settings);
    this.publishGeometry();
    if (settings.scope === "global") this.syncGlobal();
    if (settings.propertiesMode !== "collapse") this.properties.restore([...this.active]);
    this.active.forEach((view) => this.applyPropertiesMode(view));
    this.requestLayout();
  }
  /**
   * Called on file-open. In note scope pagination is per note, so a pane showing a new
   * note resets; in global scope a newly shown note joins the everywhere-on state.
   */
  noteOpened() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view) return;
    if (this.settings.scope === "global") {
      this.settings.globalEnabled ? this.activate(view) : this.deactivate(view);
      return;
    }
    if (this.active.has(view)) this.deactivate(view);
  }
  /** True while the given pane is showing the paginated view. */
  isPaginated(view) {
    return this.active.has(view);
  }
  /** Schedules a debounced re-layout of all active panes; safe from any render or resize event. */
  requestLayout() {
    if (this.suspended) return;
    if (this.active.size > 0) this.relayout();
  }
  /**
   * Halts every source of DOM work for the duration of a print or PDF export:
   * cancels the debounced pass and any pending animation frame, disconnects the
   * resize observers, and strips the page spacers so the exporter sees the note
   * in its natural flow. Pane activation state is kept for resume(). Idempotent.
   */
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this.relayout.cancel();
    this.cancelPendingFrame();
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.active.forEach((view) => {
      const sizer = this.sizerOf(view);
      if (sizer) this.paginators.get(sizer)?.clear();
    });
  }
  /** Rebuilds every paginated pane after a print or PDF export ends. Idempotent. */
  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    this.requestLayout();
  }
  dispose() {
    this.relayout.cancel();
    this.cancelPendingFrame();
    this.suspended = false;
    [...this.active].forEach((view) => this.deactivate(view));
  }
  /** Brings every open Markdown pane in line with the persisted global state. */
  syncGlobal() {
    const views = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view).filter((view) => view instanceof import_obsidian.MarkdownView);
    views.forEach((view) => this.settings.globalEnabled ? this.activate(view) : this.deactivate(view));
  }
  activate(view) {
    if (this.active.has(view)) return;
    this.active.add(view);
    view.containerEl.classList.add(ACTIVE_CLASS);
    this.applyPropertiesMode(view);
    this.layoutActiveViews();
  }
  deactivate(view) {
    if (!this.active.delete(view)) return;
    view.containerEl.classList.remove(ACTIVE_CLASS, HIDE_PROPS_CLASS);
    this.properties.restore([view]);
    const sizer = this.sizerOf(view);
    if (!sizer) return;
    this.paginators.get(sizer)?.clear();
    this.observers.get(sizer)?.disconnect();
    this.observers.delete(sizer);
  }
  layoutActiveViews() {
    if (this.suspended) return;
    this.pruneClosedViews();
    const views = [...this.active].filter((view) => !view.containerEl.closest(".print"));
    if (this.settings.propertiesMode === "collapse" && this.properties.collapse(views)) {
      this.pendingFrame = requestAnimationFrame(() => {
        this.pendingFrame = null;
        this.layoutActiveViews();
      });
      return;
    }
    views.forEach((view) => {
      const sizer = this.sizerOf(view);
      if (!sizer) return;
      this.paginatorFor(sizer).apply(this.metrics);
      this.observe(sizer);
    });
  }
  /** Marks the pane so the stylesheet can drop the in-note Properties panel in sidebar mode. */
  applyPropertiesMode(view) {
    view.containerEl.classList.toggle(HIDE_PROPS_CLASS, this.settings.propertiesMode === "sidebar");
  }
  /** Geometry lives on <body> as CSS variables; they are inert until a pane carries ACTIVE_CLASS. */
  publishGeometry() {
    const { style } = document.body;
    style.setProperty("--pagewise-page-width", `${this.metrics.pageWidthPx}px`);
    style.setProperty("--pagewise-page-height", `${this.metrics.pageHeightPx}px`);
    style.setProperty("--pagewise-margin", `${this.metrics.marginPx}px`);
    style.setProperty("--pagewise-gap", `${this.metrics.gapPx}px`);
  }
  paginatorFor(sizer) {
    let paginator = this.paginators.get(sizer);
    if (!paginator) {
      paginator = new Paginator(sizer);
      this.paginators.set(sizer, paginator);
    }
    return paginator;
  }
  /** Watches the sizer's width so wrapping changes (pane resize, sidebar toggle) trigger a re-layout. */
  observe(sizer) {
    if (this.observers.has(sizer)) return;
    let lastWidth = sizer.clientWidth;
    const observer = new ResizeObserver(() => {
      if (sizer.clientWidth === lastWidth) return;
      lastWidth = sizer.clientWidth;
      this.requestLayout();
    });
    observer.observe(sizer);
    this.observers.set(sizer, observer);
  }
  /** A closed pane leaves a detached container; drop its state so the sets cannot grow without bound. */
  pruneClosedViews() {
    this.active.forEach((view) => {
      if (!view.containerEl.isConnected) this.active.delete(view);
    });
    this.observers.forEach((observer, sizer) => {
      if (sizer.isConnected) return;
      observer.disconnect();
      this.observers.delete(sizer);
    });
  }
  cancelPendingFrame() {
    if (this.pendingFrame === null) return;
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = null;
  }
  sizerOf(view) {
    return view.previewMode.containerEl.querySelector(SIZER_SELECTOR);
  }
};
function metricsFrom(settings) {
  return resolveMetrics(pageSizeById(settings.pageSize), settings.marginMm, settings.gapPx);
}

// src/noteToolbar.ts
var import_obsidian2 = require("obsidian");

// src/tableModel.ts
function isTableLine(line) {
  return line.trim().length > 0 && splitCells(line).length > 0 && line.includes("|");
}
function parseTable(lines) {
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
    indent: /^\s*/.exec(lines[0])?.[0] ?? ""
  };
}
function serializeTable(model) {
  const widths = model.header.map(
    (cell, col) => Math.max(3, cell.length, ...model.rows.map((row) => (row[col] ?? "").length))
  );
  const line = (cells) => `${model.indent}| ${cells.map((cell, col) => cell.padEnd(widths[col])).join(" | ")} |`;
  const delimiter = model.alignments.map((alignment, col) => delimiterCell(alignment, widths[col]));
  return [line(model.header), line(delimiter), ...model.rows.map((row) => line(normalizeRow(row, widths.length)))];
}
function setAlignment(model, startColumn, endColumn, alignment) {
  const start = Math.min(startColumn, endColumn);
  const end = Math.max(startColumn, endColumn);
  if (!validColumn(model, start) || !validColumn(model, end)) return null;
  const alignments = model.alignments.map(
    (existing, column) => column >= start && column <= end ? alignment : existing
  );
  return { ...model, alignments };
}
function insertRow(model, index) {
  const at = clamp(index, 0, model.rows.length);
  const rows = [...model.rows];
  rows.splice(at, 0, new Array(model.header.length).fill(""));
  return { ...model, rows };
}
function insertColumn(model, index) {
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
function deleteRow(model, index) {
  if (index < 0 || index >= model.rows.length) return null;
  return { ...model, rows: model.rows.filter((_, i) => i !== index) };
}
function deleteColumn(model, column) {
  if (!validColumn(model, column) || model.header.length <= 1) return null;
  return {
    ...model,
    header: model.header.filter((_, i) => i !== column),
    alignments: model.alignments.filter((_, i) => i !== column),
    rows: model.rows.map((row) => row.filter((_, i) => i !== column))
  };
}
function moveRow(model, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= model.rows.length || target < 0 || target >= model.rows.length) return null;
  const rows = [...model.rows];
  const [moved] = rows.splice(index, 1);
  rows.splice(target, 0, moved);
  return { ...model, rows };
}
function moveColumn(model, column, delta) {
  const target = column + delta;
  if (!validColumn(model, column) || target < 0 || target >= model.header.length) return null;
  const move = (cells) => {
    const next = [...cells];
    const [moved] = next.splice(column, 1);
    next.splice(target, 0, moved);
    return next;
  };
  return {
    ...model,
    header: move(model.header),
    alignments: move(model.alignments),
    rows: model.rows.map(move)
  };
}
function duplicateRow(model, index) {
  if (index < 0 || index >= model.rows.length) return null;
  const rows = [...model.rows];
  rows.splice(index + 1, 0, [...model.rows[index]]);
  return { ...model, rows };
}
function sortRows(model, column, ascending) {
  if (!validColumn(model, column)) return null;
  const rows = [...model.rows].sort((a, b) => {
    const order = compareCells(a[column] ?? "", b[column] ?? "");
    return ascending ? order : -order;
  });
  return { ...model, rows };
}
function transpose(model) {
  const header = [model.header[0] ?? "", ...model.rows.map((row) => row[0] ?? "")];
  const rows = model.header.slice(1).map((label, i) => [label, ...model.rows.map((row) => row[i + 1] ?? "")]);
  return {
    ...model,
    header,
    alignments: new Array(header.length).fill("none"),
    rows
  };
}
function splitCells(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells = [];
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
function parseDelimiter(line) {
  const cells = splitCells(line);
  const alignments = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    alignments.push(left && right ? "center" : left ? "left" : right ? "right" : "none");
  }
  return alignments;
}
function delimiterCell(alignment, width) {
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
function normalizeRow(cells, width) {
  const row = cells.slice(0, width);
  while (row.length < width) row.push("");
  return row;
}
function normalizeAlignments(alignments, width) {
  const next = alignments.slice(0, width);
  while (next.length < width) next.push("none");
  return next;
}
function compareCells(a, b) {
  const numA = Number(a);
  const numB = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  return a.localeCompare(b);
}
function validColumn(model, column) {
  return column >= 0 && column < model.header.length;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// src/tableEditor.ts
function locateTable(editor) {
  const cursor = editor.getCursor();
  if (!isTableLine(editor.getLine(cursor.line))) return null;
  let startLine = cursor.line;
  while (startLine > 0 && isTableLine(editor.getLine(startLine - 1))) startLine -= 1;
  let endLine = cursor.line;
  while (endLine < editor.lineCount() - 1 && isTableLine(editor.getLine(endLine + 1))) endLine += 1;
  const lines = [];
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
      bodyRow: relative >= 2 && relative - 2 < model.rows.length ? relative - 2 : null
    }
  };
}
function clampToBlock(pos, startLine, endLine, editor) {
  if (pos.line < startLine) return { line: startLine, ch: 0 };
  if (pos.line > endLine) return { line: endLine, ch: editor.getLine(endLine).length };
  return pos;
}
function applyTableEdit(editor, transform) {
  const located = locateTable(editor);
  if (!located) return;
  const next = transform(located.model, located.context);
  if (!next) return;
  replaceTable(editor, located, serializeTable(next));
}
function deleteTable(editor) {
  const located = locateTable(editor);
  if (!located) return;
  const afterEnd = located.endLine < editor.lineCount() - 1;
  editor.replaceRange(
    "",
    { line: located.startLine, ch: 0 },
    afterEnd ? { line: located.endLine + 1, ch: 0 } : { line: located.endLine, ch: editor.getLine(located.endLine).length }
  );
  editor.setCursor({ line: Math.min(located.startLine, editor.lineCount() - 1), ch: 0 });
}
function replaceTable(editor, located, lines) {
  const cursor = editor.getCursor();
  editor.replaceRange(
    lines.join("\n"),
    { line: located.startLine, ch: 0 },
    { line: located.endLine, ch: editor.getLine(located.endLine).length }
  );
  const line = Math.min(cursor.line, located.startLine + lines.length - 1);
  editor.setCursor({ line, ch: Math.min(cursor.ch, editor.getLine(line).length) });
}
function columnAt(lineText, ch, columnCount) {
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

// src/noteToolbar.ts
var TOOLBAR_CLASS = "pagewise-toolbar";
var FORMAT_GROUP_CLASS = "pagewise-toolbar-format";
var HOST_CLASS = "pagewise-has-toolbar";
var HEADING_LEVELS = [1, 2, 3, 4, 5, 6];
var HEADING_ICON_PREFIX = "pagewise-heading-";
var SEPARATOR_ICON = "pagewise-separator";
var EXPANDED_CLASS = "is-expanded";
var VERTICAL_CLASS = "is-vertical";
var COLLAPSE_DELAY_MS = 5e3;
function registerCustomIcons() {
  HEADING_LEVELS.forEach((level) => {
    (0, import_obsidian2.addIcon)(
      `${HEADING_ICON_PREFIX}${level}`,
      `<rect x="14" y="14" width="72" height="72" rx="16" fill="none" stroke="currentColor" stroke-width="7"/><text x="50" y="68" text-anchor="middle" font-size="48" font-weight="600" fill="currentColor">${level}</text>`
    );
  });
  (0, import_obsidian2.addIcon)(
    SEPARATOR_ICON,
    '<circle cx="16" cy="50" r="9" fill="currentColor"/><line x1="34" y1="50" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'
  );
}
var BLOCK_MENU_ITEMS = [
  { title: "List", icon: ["list"], commandId: "editor:toggle-bullet-list" },
  { title: "Ordered list", icon: ["list-ordered"], commandId: "editor:toggle-numbered-list" },
  { title: "Block quote", icon: ["message-square-quote", "quote"], commandId: "editor:toggle-blockquote" },
  { title: "Todo", icon: ["check-square", "square-check"], commandId: "editor:toggle-checklist-status" }
];
var CALLOUT_TYPES = [
  { id: "note", title: "Note", icon: ["pencil"] },
  { id: "tip", title: "Tip", icon: ["flame"] },
  { id: "important", title: "Important", icon: ["alert-circle", "circle-alert"] },
  { id: "warning", title: "Warning", icon: ["alert-triangle", "triangle-alert"] },
  { id: "caution", title: "Caution", icon: ["alert-octagon", "octagon-alert"] }
];
var NoteToolbar = class {
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    /** One observer per pane, so the bar re-anchors when the pane is resized. */
    this.hostObservers = /* @__PURE__ */ new Map();
    /** Direction bars are built for; sync() keeps it current and rebuilds bars that disagree. */
    this.vertical = false;
    registerCustomIcons();
  }
  /**
   * Ensures each open Markdown pane has a toolbar exactly when the predicate says so.
   * A direction change rebuilds existing bars, since tooltip placement is set at build time.
   */
  sync(shouldShow, direction = "horizontal") {
    this.vertical = direction === "vertical";
    this.pruneClosedHosts();
    this.markdownViews().forEach((view) => {
      const host = view.contentEl;
      let existing = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
      if (!shouldShow(view)) {
        existing?.remove();
        host.classList.remove(HOST_CLASS);
        this.hostObservers.get(host)?.disconnect();
        this.hostObservers.delete(host);
        return;
      }
      if (existing instanceof HTMLElement && existing.classList.contains(VERTICAL_CLASS) !== this.vertical) {
        existing.remove();
        existing = null;
      }
      if (existing instanceof HTMLElement) {
        this.position(existing, host);
        this.observeHost(host);
        return;
      }
      host.classList.add(HOST_CLASS);
      const bar = this.build(view);
      host.append(bar);
      this.position(bar, host);
      this.observeHost(host);
    });
  }
  /**
   * Stops all observation for the duration of a print or PDF export. The bars stay
   * in place (the print stylesheet hides them); the next sync() re-observes hosts.
   */
  suspend() {
    this.hostObservers.forEach((observer) => observer.disconnect());
    this.hostObservers.clear();
  }
  dispose() {
    this.hostObservers.forEach((observer) => observer.disconnect());
    this.hostObservers.clear();
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.classList.remove(HOST_CLASS));
  }
  /**
   * Anchors the collapsed handle 12px left of the sheet (clamped to the pane edge);
   * the expanded tray slides rightward from there. Anchoring on the collapsed footprint
   * keeps the handle stationary across expand and collapse.
   */
  position(bar, host) {
    const pageWidth = parseFloat(getComputedStyle(document.body).getPropertyValue("--pagewise-page-width"));
    if (!Number.isFinite(pageWidth)) return;
    const pageLeft = (host.clientWidth - pageWidth) / 2;
    const handle = bar.querySelector(".pagewise-toolbar-handle");
    const collapsedWidth = (handle?.offsetWidth ?? bar.offsetWidth) + 6;
    bar.style.left = `${Math.max(8, pageLeft - collapsedWidth - 12)}px`;
  }
  observeHost(host) {
    if (this.hostObservers.has(host)) return;
    const observer = new ResizeObserver(() => {
      const bar = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
      if (bar instanceof HTMLElement) this.position(bar, host);
    });
    observer.observe(host);
    this.hostObservers.set(host, observer);
  }
  /** A closed pane leaves a detached host; drop its observer so the map cannot grow without bound. */
  pruneClosedHosts() {
    this.hostObservers.forEach((observer, host) => {
      if (host.isConnected) return;
      observer.disconnect();
      this.hostObservers.delete(host);
    });
  }
  build(view) {
    const bar = document.createElement("div");
    bar.className = TOOLBAR_CLASS;
    bar.classList.toggle(VERTICAL_CLASS, this.vertical);
    bar.addEventListener("mousedown", (event) => event.preventDefault());
    const format = document.createElement("div");
    format.className = FORMAT_GROUP_CLASS;
    format.append(
      this.headingButton(view),
      this.blocksButton(view),
      this.iconButton(["bold"], "Bold", () => this.command("editor:toggle-bold")),
      this.iconButton(["italic"], "Italic", () => this.command("editor:toggle-italics")),
      this.iconButton(
        ["paintbrush-vertical", "paintbrush-2", "paintbrush"],
        "Highlight",
        () => this.command("editor:toggle-highlight")
      ),
      this.iconButton(["link-2", "link"], "Insert link", () => this.command("editor:insert-link")),
      this.tableButton(view),
      this.iconButton(["image-plus", "image"], "Insert image", () => this.command("editor:attach-file"))
    );
    const content = document.createElement("div");
    content.className = "pagewise-toolbar-content";
    content.append(format, this.iconButton(["info"], "Toggle properties sidebar", this.actions.toggleProperties));
    const reveal = document.createElement("div");
    reveal.className = "pagewise-toolbar-reveal";
    reveal.append(content);
    bar.append(this.handleButton(bar), reveal);
    this.wireCollapse(bar);
    return bar;
  }
  /** The always-visible handle: a plus circle at rest, a chevron circle while expanded. */
  handleButton(bar) {
    const button = this.button("Formatting tools", () => bar.classList.toggle(EXPANDED_CLASS));
    button.classList.add("pagewise-toolbar-handle");
    const plus = document.createElement("span");
    plus.className = "pagewise-handle-icon is-plus";
    (0, import_obsidian2.setIcon)(plus, resolveIcon(["circle-plus", "plus-circle"]));
    const chevron = document.createElement("span");
    chevron.className = "pagewise-handle-icon is-chevron";
    (0, import_obsidian2.setIcon)(chevron, resolveIcon(["circle-chevron-right", "chevron-right-circle"]));
    button.append(plus, chevron);
    return button;
  }
  /**
   * Collapse state machine: hovering the bar expands it at once; after the pointer
   * leaves, it stays expanded for a five-second grace period, then collapses. Re-entering
   * during the grace period cancels the collapse. The handle click toggles for trackpads.
   */
  wireCollapse(bar) {
    let timer = null;
    bar.addEventListener("mouseenter", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      bar.classList.add(EXPANDED_CLASS);
    });
    bar.addEventListener("mouseleave", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => bar.classList.remove(EXPANDED_CLASS), COLLAPSE_DELAY_MS);
    });
  }
  /** The H control: the heading icon with a chevron that opens the Heading 1-6 menu. */
  headingButton(view) {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    (0, import_obsidian2.setIcon)(face, "heading");
    return this.menuButton(face, "Headings", (menu) => {
      HEADING_LEVELS.forEach((level) => {
        menu.addItem(
          (item) => item.setTitle(`Heading ${level}`).setIcon(`${HEADING_ICON_PREFIX}${level}`).onClick(() => this.setHeading(view, level))
        );
      });
    });
  }
  /** The blocks control: Bear's list menu, mapped to Obsidian's own Markdown commands. */
  blocksButton(view) {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    (0, import_obsidian2.setIcon)(face, "list");
    return this.menuButton(face, "Lists and blocks", (menu) => {
      BLOCK_MENU_ITEMS.forEach(({ title, icon, commandId }) => {
        menu.addItem((item) => {
          item.setTitle(title).setIcon(resolveIcon(icon)).onClick(() => this.command(commandId));
          this.appendHotkeyHint(item, commandId);
        });
      });
      this.calloutMenuItem(menu, "Callout", view, false);
      this.calloutMenuItem(menu, "Callout (inline)", view, true);
      menu.addSeparator();
      menu.addItem(
        (item) => item.setTitle("Separator").setIcon(SEPARATOR_ICON).onClick(() => this.insertSeparator(view))
      );
    });
  }
  /** The table control: insert a new table, or operate on the one under the cursor. */
  tableButton(view) {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    (0, import_obsidian2.setIcon)(face, resolveIcon(["grid-3x3", "grid", "table"]));
    return this.menuButton(face, "Table", (menu) => this.fillTableMenu(menu, view));
  }
  /**
   * The table menu, built fresh on every open so it reflects where the cursor is:
   * everything but "New table" needs the cursor inside a table, and row operations
   * additionally need it on a body row rather than the header or delimiter line.
   * Operations rewrite the table's Markdown directly, because Obsidian keeps its
   * own table functions in the widget's private context menu, not in commands.
   */
  fillTableMenu(menu, view) {
    const editor = view.editor;
    const located = locateTable(editor);
    const inTable = located !== null;
    const onBodyRow = located?.context.bodyRow !== null && inTable;
    const edit = (transform) => () => applyTableEdit(editor, transform);
    const alignEntry = (title, icon, alignment) => ({
      title,
      icon,
      action: edit((model, ctx) => setAlignment(model, ctx.column, ctx.columnEnd, alignment))
    });
    menu.addItem((item) => {
      item.setTitle("New table").setIcon(resolveIcon(["table", "grid-3x3"])).onClick(() => this.command("editor:insert-table"));
      this.appendHotkeyHint(item, "editor:insert-table");
    });
    menu.addSeparator();
    this.submenuItem(
      menu,
      "Align column",
      ["align-center", "align-left"],
      [
        alignEntry("Left", ["align-left"], "left"),
        alignEntry("Center", ["align-center"], "center"),
        alignEntry("Right", ["align-right"], "right")
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Insert",
      ["plus"],
      [
        {
          title: "Row above",
          icon: ["arrow-up-to-line", "arrow-up"],
          action: edit((model, ctx) => insertRow(model, ctx.bodyRow ?? 0))
        },
        {
          title: "Row below",
          icon: ["arrow-down-to-line", "arrow-down"],
          action: edit((model, ctx) => insertRow(model, ctx.bodyRow === null ? 0 : ctx.bodyRow + 1))
        },
        {
          title: "Column left",
          icon: ["arrow-left-to-line", "arrow-left"],
          action: edit((model, ctx) => insertColumn(model, ctx.column))
        },
        {
          title: "Column right",
          icon: ["arrow-right-to-line", "arrow-right"],
          action: edit((model, ctx) => insertColumn(model, ctx.column + 1))
        }
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Move",
      ["move", "move-3d"],
      [
        {
          title: "Row up",
          icon: ["move-up", "arrow-up"],
          action: edit((model, ctx) => ctx.bodyRow === null ? null : moveRow(model, ctx.bodyRow, -1)),
          disabled: !onBodyRow
        },
        {
          title: "Row down",
          icon: ["move-down", "arrow-down"],
          action: edit((model, ctx) => ctx.bodyRow === null ? null : moveRow(model, ctx.bodyRow, 1)),
          disabled: !onBodyRow
        },
        {
          title: "Column left",
          icon: ["move-left", "arrow-left"],
          action: edit((model, ctx) => moveColumn(model, ctx.column, -1))
        },
        {
          title: "Column right",
          icon: ["move-right", "arrow-right"],
          action: edit((model, ctx) => moveColumn(model, ctx.column, 1))
        }
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Delete",
      ["trash-2", "trash"],
      [
        {
          title: "Row",
          icon: ["trash-2", "trash"],
          action: edit((model, ctx) => ctx.bodyRow === null ? null : deleteRow(model, ctx.bodyRow)),
          disabled: !onBodyRow
        },
        {
          title: "Column",
          icon: ["trash-2", "trash"],
          action: edit((model, ctx) => deleteColumn(model, ctx.column))
        },
        { title: "Table", icon: ["trash-2", "trash"], action: () => deleteTable(editor) }
      ],
      !inTable
    );
    menu.addSeparator();
    this.submenuItem(
      menu,
      "Sort rows",
      ["arrow-down-a-z", "sort-asc"],
      [
        {
          title: "A to Z",
          icon: ["arrow-down-a-z", "sort-asc"],
          action: edit((model, ctx) => sortRows(model, ctx.column, true))
        },
        {
          title: "Z to A",
          icon: ["arrow-down-z-a", "sort-desc"],
          action: edit((model, ctx) => sortRows(model, ctx.column, false))
        }
      ],
      !inTable
    );
    menu.addItem((item) => {
      item.setTitle("Duplicate row").setIcon(resolveIcon(["copy-plus", "copy"]));
      if (!onBodyRow) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model, ctx) => ctx.bodyRow === null ? null : duplicateRow(model, ctx.bodyRow)));
    });
    menu.addItem((item) => {
      item.setTitle("Tidy table").setIcon(resolveIcon(["wand-sparkles", "wand-2", "wand"]));
      if (!inTable) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model) => model));
    });
    menu.addItem((item) => {
      item.setTitle("Transpose").setIcon(resolveIcon(["move-diagonal", "maximize-2"]));
      if (!inTable) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model) => transpose(model)));
    });
  }
  /**
   * A button whose face is the given element and whose click opens a native menu:
   * under the pointer in horizontal mode, and at the button's right edge in vertical
   * mode so the menu never covers the controls below it.
   */
  menuButton(face, label, fill) {
    const button = this.button(label, (event) => {
      const menu = new import_obsidian2.Menu();
      menu.setUseNativeMenu(false);
      menu.dom?.classList.add("pagewise-menu");
      fill(menu);
      if (button.closest(`.${TOOLBAR_CLASS}`)?.classList.contains(VERTICAL_CLASS)) {
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right + 6, y: rect.top });
      } else {
        menu.showAtMouseEvent(event);
      }
    });
    button.classList.add("has-menu");
    const chevron = document.createElement("span");
    chevron.className = "pagewise-chevron";
    (0, import_obsidian2.setIcon)(chevron, "chevron-down");
    button.append(face, chevron);
    return button;
  }
  /** A callout entry whose submenu offers Bear's five types. */
  calloutMenuItem(menu, title, view, inline) {
    this.submenuItem(
      menu,
      title,
      ["list-indent-increase", "indent"],
      CALLOUT_TYPES.map(({ id, title: entryTitle, icon }) => ({
        title: entryTitle,
        icon,
        action: () => this.insertCallout(view, id, inline)
      }))
    );
  }
  /**
   * A menu entry with a submenu of the given entries, opened on hover or click and
   * placed at the entry's right edge so it never covers the parent menu. Hovering a
   * different parent entry closes it. Without a reachable item DOM (no place to
   * anchor), the entry itself runs the first enabled action.
   */
  submenuItem(menu, title, icon, entries, disabled = false) {
    menu.addItem((item) => {
      item.setTitle(title).setIcon(resolveIcon(icon));
      if (disabled) {
        item.setDisabled(true);
        return;
      }
      const itemDom = item.dom;
      if (!itemDom) {
        const fallback = entries.find((entry) => !entry.disabled);
        if (fallback) item.onClick(() => fallback.action());
        return;
      }
      const arrow = document.createElement("span");
      arrow.className = "pagewise-submenu-arrow";
      (0, import_obsidian2.setIcon)(arrow, "chevron-right");
      itemDom.append(arrow);
      let submenu = null;
      const close = () => {
        submenu?.hide();
        submenu = null;
      };
      const open = () => {
        if (submenu) return;
        submenu = this.buildEntrySubmenu(menu, entries);
        const rect = itemDom.getBoundingClientRect();
        submenu.showAtPosition({ x: rect.right + 4, y: rect.top });
      };
      itemDom.addEventListener("mouseenter", open);
      item.onClick(open);
      menu.dom?.addEventListener("mouseover", (event) => {
        if (event.target instanceof Node && !itemDom.contains(event.target)) close();
      });
    });
  }
  /** The submenu itself; picking an entry runs it and closes both menus. */
  buildEntrySubmenu(parent, entries) {
    const submenu = new import_obsidian2.Menu();
    submenu.setUseNativeMenu(false);
    submenu.dom?.classList.add("pagewise-menu");
    entries.forEach(
      ({ title, icon, action, disabled }) => submenu.addItem((item) => {
        item.setTitle(title).setIcon(resolveIcon(icon));
        if (disabled) {
          item.setDisabled(true);
          return;
        }
        item.onClick(() => {
          action();
          parent.hide();
        });
      })
    );
    return submenu;
  }
  /**
   * Inserts an Obsidian callout. Block form puts the marker on its own line with the
   * selection as quoted body lines; inline form is the one-line `> [!type] text` callout.
   */
  insertCallout(view, type, inline) {
    const editor = view.editor;
    const selection = editor.getSelection();
    const line = editor.getLine(editor.getCursor().line);
    const lead = line.trim().length === 0 ? "" : "\n\n";
    if (inline) {
      editor.replaceSelection(`${lead}> [!${type}] ${selection}`);
      return;
    }
    const body = selection ? selection.split("\n").map((l) => `> ${l}`).join("\n") : "> ";
    editor.replaceSelection(`${lead}> [!${type}]
${body}`);
  }
  /** Shows the user's actual hotkey for the command, Bear-style; nothing when unbound. */
  appendHotkeyHint(item, commandId) {
    const hint = this.app.hotkeyManager?.printHotkeyForCommand?.(commandId);
    const dom = item.dom;
    if (!hint || !dom) return;
    const span = document.createElement("span");
    span.className = "pagewise-hotkey";
    span.textContent = hint;
    dom.append(span);
  }
  /** Inserts a thematic break (---) on its own line at the cursor. */
  insertSeparator(view) {
    const editor = view.editor;
    const lineNumber = editor.getCursor().line;
    const line = editor.getLine(lineNumber);
    editor.replaceSelection(line.trim().length === 0 ? "---\n" : "\n\n---\n");
  }
  /** Sets the cursor line to the given heading level; picking its current level clears it. */
  setHeading(view, level) {
    const editor = view.editor;
    const lineNumber = editor.getCursor().line;
    const line = editor.getLine(lineNumber);
    const match = /^(#{1,6})\s+/.exec(line);
    const body = match ? line.slice(match[0].length) : line;
    const next = match?.[1].length === level ? body : `${"#".repeat(level)} ${body}`;
    editor.setLine(lineNumber, next);
    editor.setCursor({ line: lineNumber, ch: next.length });
  }
  iconButton(icons, label, onClick) {
    const button = this.button(label, onClick);
    (0, import_obsidian2.setIcon)(button, resolveIcon(icons));
    return button;
  }
  button(label, onClick) {
    const button = document.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.setAttribute("aria-label", label);
    (0, import_obsidian2.setTooltip)(button, label, { placement: this.vertical ? "right" : "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
    return button;
  }
  command(id) {
    this.app.commands.executeCommandById(id);
  }
  markdownViews() {
    return this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view).filter((view) => view instanceof import_obsidian2.MarkdownView);
  }
};
function resolveIcon(icons) {
  return icons.find((name) => (0, import_obsidian2.getIcon)(name)) ?? icons[icons.length - 1];
}

// src/printGuard.ts
var PrintGuard = class {
  constructor(hooks) {
    this.hooks = hooks;
    this.engaged = false;
    this.media = window.matchMedia("print");
  }
  /** True while any live print signal is present, whether or not events fired. */
  isPrinting() {
    return this.engaged || this.media.matches || hasPrintContainer();
  }
  /**
   * Wires up the three signals. Each teardown is handed to `register`, so the
   * caller (the plugin) can bind their lifetime to its own unload.
   */
  install(register) {
    const engage = () => this.engage();
    const release = () => this.release();
    window.addEventListener("beforeprint", engage);
    window.addEventListener("afterprint", release);
    register(() => window.removeEventListener("beforeprint", engage));
    register(() => window.removeEventListener("afterprint", release));
    const onMediaChange = (event) => event.matches ? engage() : release();
    this.media.addEventListener("change", onMediaChange);
    register(() => this.media.removeEventListener("change", onMediaChange));
    const observer = new MutationObserver(() => hasPrintContainer() ? engage() : release());
    observer.observe(document.body, { childList: true });
    register(() => observer.disconnect());
  }
  engage() {
    if (this.engaged) return;
    this.engaged = true;
    this.hooks.suspend();
  }
  /** Resumes only once every live signal has cleared; later signals retry it. */
  release() {
    if (!this.engaged) return;
    if (this.media.matches || hasPrintContainer()) return;
    this.engaged = false;
    this.hooks.resume();
  }
};
function hasPrintContainer() {
  return document.body.querySelector(":scope > .print") !== null;
}

// src/propertiesSidebar.ts
var PROPERTIES_VIEW_TYPE = "file-properties";
var PropertiesSidebar = class {
  constructor(app) {
    this.app = app;
  }
  toggle() {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE)[0];
    const sidebarOpen = !(workspace.rightSplit?.collapsed ?? true);
    if (existing && sidebarOpen) {
      workspace.rightSplit.collapse();
      return;
    }
    if (existing) {
      void workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    void leaf.setViewState({ type: PROPERTIES_VIEW_TYPE, active: true }).then(() => {
      void workspace.revealLeaf(leaf);
    });
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = {
  scope: "note",
  globalEnabled: false,
  pageSize: "a4",
  marginMm: 25.4,
  gapPx: 24,
  propertiesMode: "sidebar",
  toolbarDirection: "horizontal"
};
var PagewiseSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Toggle scope").setDesc(
      "This note only: pagination applies to the focused note and resets when it is closed or replaced. All notes: pagination applies everywhere at once and survives restarts."
    ).addDropdown(
      (dropdown) => dropdown.addOption("note", "This note only (resets on close)").addOption("global", "All notes (persistent)").setValue(this.plugin.settings.scope).onChange(async (value) => {
        await this.plugin.updateSettings({ scope: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Page size").setDesc("Sheet dimensions used for the paginated view.").addDropdown((dropdown) => {
      PAGE_SIZES.forEach((size) => dropdown.addOption(size.id, size.label));
      dropdown.setValue(this.plugin.settings.pageSize).onChange(async (value) => {
        await this.plugin.updateSettings({ pageSize: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Margins (mm)").setDesc("Applied to all four sides. 25.4 mm matches the Word default of one inch.").addSlider(
      (slider) => slider.setLimits(10, 40, 1).setDynamicTooltip().setValue(this.plugin.settings.marginMm).onChange(async (value) => {
        await this.plugin.updateSettings({ marginMm: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Properties in paginated view").setDesc(
      "Move to sidebar: the panel leaves the page; open it on demand with the toolbar\u2019s info button or Obsidian\u2019s own Properties view. Collapse in place: the panel stays on the page, folded. Leave unchanged: no intervention. The note's frontmatter is never modified."
    ).addDropdown(
      (dropdown) => dropdown.addOption("sidebar", "Move to sidebar").addOption("collapse", "Collapse in place").addOption("none", "Leave unchanged").setValue(this.plugin.settings.propertiesMode).onChange(async (value) => {
        await this.plugin.updateSettings({ propertiesMode: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Gap between sheets (px)").addSlider(
      (slider) => slider.setLimits(0, 64, 4).setDynamicTooltip().setValue(this.plugin.settings.gapPx).onChange(async (value) => {
        await this.plugin.updateSettings({ gapPx: value });
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Toolbar expansion").setDesc("Which way the collapsed toolbar opens its tray of controls.").addDropdown(
      (dropdown) => dropdown.addOption("horizontal", "Horizontal (to the right)").addOption("vertical", "Vertical (downwards)").setValue(this.plugin.settings.toolbarDirection).onChange(async (value) => {
        await this.plugin.updateSettings({ toolbarDirection: value });
      })
    );
  }
};

// src/main.ts
var PagewisePlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
    this.controller = new PaginationController(this.app, this.settings);
    const propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, {
      toggleProperties: () => propertiesSidebar.toggle()
    });
    this.printGuard = new PrintGuard({
      suspend: () => {
        this.controller.suspend();
        this.toolbar.suspend();
      },
      resume: () => {
        this.controller.resume();
        this.syncToolbar();
      }
    });
    this.printGuard.install((teardown) => this.register(teardown));
    this.addCommand({
      id: "toggle-paginated-view",
      name: "Toggle paginated view for this note",
      callback: () => void this.toggle()
    });
    this.addRibbonIcon("book-open", "Toggle paginated view (Pagewise)", () => void this.toggle());
    this.addSettingTab(new PagewiseSettingTab(this.app, this));
    this.registerMarkdownPostProcessor((el) => {
      if (this.printGuard.isPrinting() || el.closest(".print")) return;
      this.controller.requestLayout();
    });
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.controller.noteOpened();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.controller.requestLayout();
        this.syncToolbar();
      })
    );
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.controller.requestLayout()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.controller.requestLayout()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
    this.app.workspace.onLayoutReady(() => {
      this.controller.applySettings(this.settings);
      this.syncToolbar();
    });
  }
  onunload() {
    this.controller.dispose();
    this.toolbar.dispose();
  }
  /** Routes the toggle by scope: one ephemeral pane, or the persisted every-note state. */
  async toggle() {
    if (this.settings.scope === "note") {
      this.controller.toggleActiveView();
      this.syncToolbar();
      return;
    }
    await this.updateSettings({ globalEnabled: !this.settings.globalEnabled });
  }
  /** Merges a partial change into settings, persists it, and re-applies active panes. */
  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await this.saveData(this.settings);
    this.controller.applySettings(this.settings);
    this.syncToolbar();
  }
  /** Every paginated pane carries the note toolbar; unpaginated panes carry none. */
  syncToolbar() {
    this.toolbar.sync((view) => this.controller.isPaginated(view), this.settings.toolbarDirection);
  }
};
