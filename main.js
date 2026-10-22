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
var import_obsidian8 = require("obsidian");

// src/pagination/controller.ts
var import_obsidian2 = require("obsidian");

// src/pagination/layoutEngine.ts
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

// src/pagination/paginator.ts
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

// src/obsidianInternals.ts
function executeCommand(app, id) {
  app.commands?.executeCommandById?.(id);
}
function hotkeyFor(app, id) {
  return app.hotkeyManager?.printHotkeyForCommand?.(id) ?? "";
}
function menuDom(menu) {
  return menu.dom;
}
function menuItemDom(item) {
  return item.dom;
}
function setMetadataCollapsed(view, collapsed) {
  const editor = view.metadataEditor;
  if (typeof editor?.setCollapse !== "function") return false;
  editor.setCollapse(collapsed, false);
  return true;
}

// src/properties/propertiesCollapser.ts
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
  if (container.closest(".markdown-source-view") && setMetadataCollapsed(view, collapsed)) return;
  container.classList.toggle(COLLAPSED_CLASS, collapsed);
  container.querySelector(INDICATOR_SELECTOR)?.classList.toggle(COLLAPSED_CLASS, collapsed);
}

// src/pagination/pageSizes.ts
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

// src/workspace.ts
var import_obsidian = require("obsidian");
function markdownViews(app) {
  return app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view).filter((view) => view instanceof import_obsidian.MarkdownView);
}

// src/pagination/controller.ts
var ACTIVE_CLASS = "pagewise-active";
var HIDE_PROPS_CLASS = "pagewise-props-hidden";
var SIZER_SELECTOR = ".markdown-preview-sizer";
var RELAYOUT_DELAY_MS = 120;
var GEOMETRY_VARS = ["--pagewise-page-width", "--pagewise-page-height", "--pagewise-margin", "--pagewise-gap"];
var PaginationController = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.active = /* @__PURE__ */ new Set();
    this.paginators = /* @__PURE__ */ new WeakMap();
    this.observers = /* @__PURE__ */ new Map();
    this.properties = new PropertiesCollapser();
    this.pendingFrame = null;
    this.metrics = metricsFrom(settings);
    this.publishGeometry();
    this.relayout = (0, import_obsidian2.debounce)(() => this.layoutActiveViews(), RELAYOUT_DELAY_MS, true);
  }
  /** Toggles the paginated view for the note in focus; a no-op outside Markdown panes. */
  toggleActiveView() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if (!view) {
      new import_obsidian2.Notice("Pagewise: no active note to paginate.");
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
    const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if (!view) return;
    if (this.settings.scope === "global") {
      if (!this.settings.globalEnabled) {
        this.deactivate(view);
        return;
      }
      if (this.active.has(view)) {
        this.properties.forget([view]);
        this.requestLayout();
        return;
      }
      this.activate(view);
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
    if (this.active.size > 0) this.relayout();
  }
  /** Returns every pane to Obsidian's own view and removes all Pagewise state from the DOM. */
  dispose() {
    this.relayout.cancel();
    this.cancelPendingFrame();
    [...this.active].forEach((view) => this.deactivate(view));
    GEOMETRY_VARS.forEach((name) => document.body.style.removeProperty(name));
  }
  /** Brings every open Markdown pane in line with the persisted global state. */
  syncGlobal() {
    markdownViews(this.app).forEach((view) => this.settings.globalEnabled ? this.activate(view) : this.deactivate(view));
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
    this.pruneClosedViews();
    const views = [...this.active];
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
    const { pageWidthPx, pageHeightPx, marginPx, gapPx } = this.metrics;
    const values = [pageWidthPx, pageHeightPx, marginPx, gapPx];
    GEOMETRY_VARS.forEach((name, i) => document.body.style.setProperty(name, `${values[i]}px`));
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

// src/properties/propertiesSidebar.ts
var import_obsidian3 = require("obsidian");
var PROPERTIES_VIEW_TYPE = "file-properties";
var INSPECTOR_CLASS = "pagewise-inspector";
var HEADER_CLASS = "pagewise-inspector-header";
var PropertiesSidebar = class {
  constructor(app) {
    this.app = app;
  }
  /**
   * Shows the note's properties, or hides the sidebar holding them if they already
   * show. Pinned views are treated as Obsidian's "Show file properties" command treats
   * them: one pinned to this note is reused, others are left alone. Unlike that
   * command, focus stays in the note.
   */
  async toggle(file) {
    if (!file) return;
    const { workspace } = this.app;
    const shown = this.visibleLeafFor(file);
    if (shown) {
      const sidedock = this.sidedockOf(shown);
      sidedock?.collapse();
      return;
    }
    const leaves = workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE);
    const leaf = leaves.find((candidate) => isPinned(candidate) && pathOf(candidate) === file.path) ?? leaves.find((candidate) => !isPinned(candidate)) ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    if (pathOf(leaf) === null) await leaf.setViewState({ type: PROPERTIES_VIEW_TYPE, state: { file: file.path } });
    await workspace.revealLeaf(leaf);
  }
  /** True while a visible Properties view shows this note. */
  isShownFor(file) {
    return !!file && this.visibleLeafFor(file) !== null;
  }
  /**
   * Marks each Properties view as a Pagewise inspector exactly while the note it
   * shows is paginated, and gives it a heading naming that note. The name comes from
   * the view itself, so a pinned view names its pinned note.
   */
  syncInspectors(paginatedPaths) {
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      if (!(leaf.view instanceof import_obsidian3.FileView)) return;
      const file = leaf.view.file;
      const active = !!file && paginatedPaths.has(file.path);
      leaf.view.containerEl.classList.toggle(INSPECTOR_CLASS, active);
      const content = leaf.view.contentEl;
      let header = content.querySelector(`:scope > .${HEADER_CLASS}`);
      if (!active || !file) {
        header?.remove();
        return;
      }
      if (!header) {
        header = createHeader(content.ownerDocument);
        content.prepend(header);
      }
      const name = header.querySelector(".pagewise-inspector-file");
      if (name && name.textContent !== file.basename) name.textContent = file.basename;
    });
  }
  /** Removes every inspector mark and heading Pagewise added. */
  dispose() {
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      leaf.view.containerEl.classList.remove(INSPECTOR_CLASS);
      leaf.view.containerEl.querySelectorAll(`.${HEADER_CLASS}`).forEach((el) => el.remove());
    });
  }
  visibleLeafFor(file) {
    return this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).find((leaf) => pathOf(leaf) === file.path && !this.sidedockOf(leaf)?.collapsed && leaf.view.containerEl.isShown()) ?? null;
  }
  /** The left or right sidebar holding the leaf; null for a leaf among the notes or in a pop-out. */
  sidedockOf(leaf) {
    const { leftSplit, rightSplit } = this.app.workspace;
    const root = leaf.getRoot();
    return root === rightSplit ? rightSplit : root === leftSplit ? leftSplit : null;
  }
};
function pathOf(leaf) {
  if (leaf.view instanceof import_obsidian3.FileView) return leaf.view.file?.path ?? null;
  const file = leaf.getViewState().state?.file;
  return typeof file === "string" ? file : null;
}
function isPinned(leaf) {
  return leaf.getViewState().pinned === true;
}
function createHeader(doc) {
  const header = doc.createElement("div");
  header.className = HEADER_CLASS;
  const title = doc.createElement("div");
  title.className = "pagewise-inspector-title";
  title.textContent = "Properties";
  const file = doc.createElement("div");
  file.className = "pagewise-inspector-file";
  header.append(title, file);
  return header;
}

// src/settings.ts
var WORD_MARGIN_MM = 25.4;
var DEFAULT_SETTINGS = {
  scope: "note",
  globalEnabled: false,
  pageSize: "a4",
  marginMm: WORD_MARGIN_MM,
  gapPx: 24,
  propertiesMode: "sidebar",
  toolbarDirection: "horizontal"
};
function normalizeSettings(raw) {
  const data = typeof raw === "object" && raw !== null ? raw : {};
  const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const number = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const d = DEFAULT_SETTINGS;
  return {
    scope: oneOf(data.scope, ["note", "global"], d.scope),
    globalEnabled: typeof data.globalEnabled === "boolean" ? data.globalEnabled : d.globalEnabled,
    pageSize: oneOf(data.pageSize, PAGE_SIZES.map((size) => size.id), d.pageSize),
    marginMm: number(data.marginMm, 0, 100, d.marginMm),
    gapPx: number(data.gapPx, 0, 200, d.gapPx),
    propertiesMode: oneOf(data.propertiesMode, ["sidebar", "collapse", "none"], d.propertiesMode),
    toolbarDirection: oneOf(data.toolbarDirection, ["horizontal", "vertical"], d.toolbarDirection)
  };
}

// src/settingsTab.ts
var import_obsidian4 = require("obsidian");
var PagewiseSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian4.Setting(containerEl).setName("Toggle scope").setDesc(
      "This note only: pagination applies to the focused note and resets when it is closed or replaced. All notes: pagination applies everywhere at once and survives restarts."
    ).addDropdown(
      (dropdown) => dropdown.addOption("note", "This note only (resets on close)").addOption("global", "All notes (persistent)").setValue(this.plugin.settings.scope).onChange(async (value) => {
        await this.plugin.updateSettings({ scope: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Page size").setDesc("Sheet dimensions used for the paginated view.").addDropdown((dropdown) => {
      PAGE_SIZES.forEach((size) => dropdown.addOption(size.id, size.label));
      dropdown.setValue(this.plugin.settings.pageSize).onChange(async (value) => {
        await this.plugin.updateSettings({ pageSize: value });
      });
    });
    new import_obsidian4.Setting(containerEl).setName("Margins (mm)").setDesc("Applied to all four sides of the on-screen sheet. 25.4 mm matches the Word default of one inch.").addSlider(
      (slider) => slider.setLimits(10, 40, 1).setDynamicTooltip().setValue(this.plugin.settings.marginMm).onChange(async (value) => {
        await this.plugin.updateSettings({ marginMm: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Properties in paginated view").setDesc(
      "Move to sidebar: the panel leaves the page; open it on demand with the toolbar\u2019s Properties button or Obsidian\u2019s own Properties view. Collapse in place: the panel stays on the page, folded. Leave unchanged: no intervention. The note's frontmatter is never modified."
    ).addDropdown(
      (dropdown) => dropdown.addOption("sidebar", "Move to sidebar").addOption("collapse", "Collapse in place").addOption("none", "Leave unchanged").setValue(this.plugin.settings.propertiesMode).onChange(async (value) => {
        await this.plugin.updateSettings({ propertiesMode: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Gap between sheets (px)").addSlider(
      (slider) => slider.setLimits(0, 64, 4).setDynamicTooltip().setValue(this.plugin.settings.gapPx).onChange(async (value) => {
        await this.plugin.updateSettings({ gapPx: value });
      })
    );
  }
};

// src/toolbar/noteToolbar.ts
var import_obsidian7 = require("obsidian");

// src/toolbar/icons.ts
var import_obsidian5 = require("obsidian");
var HEADING_ICON_PREFIX = "pagewise-heading-";
var SEPARATOR_ICON = "pagewise-separator";
function headingIcon(level) {
  return `${HEADING_ICON_PREFIX}${level}`;
}
function registerCustomIcons(levels) {
  levels.forEach((level) => {
    (0, import_obsidian5.addIcon)(
      headingIcon(level),
      `<rect x="14" y="14" width="72" height="72" rx="16" fill="none" stroke="currentColor" stroke-width="7"/><text x="50" y="68" text-anchor="middle" font-size="48" font-weight="600" fill="currentColor">${level}</text>`
    );
  });
  (0, import_obsidian5.addIcon)(
    SEPARATOR_ICON,
    '<circle cx="16" cy="50" r="9" fill="currentColor"/><line x1="34" y1="50" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'
  );
}
function resolveIcon(icons) {
  return icons.find((name) => (0, import_obsidian5.getIcon)(name)) ?? icons[icons.length - 1];
}

// src/toolbar/markdownActions.ts
var HEADING_LEVELS = [1, 2, 3, 4, 5, 6];
function setHeading(editor, level) {
  const lineNumber = editor.getCursor().line;
  const line = editor.getLine(lineNumber);
  const match = /^(#{1,6})\s+/.exec(line);
  const body = match ? line.slice(match[0].length) : line;
  const next = match?.[1].length === level ? body : `${"#".repeat(level)} ${body}`;
  editor.setLine(lineNumber, next);
  editor.setCursor({ line: lineNumber, ch: next.length });
}
function insertCallout(editor, type, inline) {
  const selection = editor.getSelection();
  const lead = onBlankLine(editor) ? "" : "\n\n";
  if (inline) {
    editor.replaceSelection(`${lead}> [!${type}] ${selection}`);
    return;
  }
  const body = selection ? selection.split("\n").map((line) => `> ${line}`).join("\n") : "> ";
  editor.replaceSelection(`${lead}> [!${type}]
${body}`);
}
function insertSeparator(editor) {
  editor.replaceSelection(onBlankLine(editor) ? "---\n" : "\n\n---\n");
}
function onBlankLine(editor) {
  return editor.getLine(editor.getCursor().line).trim().length === 0;
}

// src/toolbar/menus.ts
var import_obsidian6 = require("obsidian");
var MENU_CLASS = "pagewise-menu";
var hideListeners = /* @__PURE__ */ new WeakMap();
function createMenu() {
  const menu = new import_obsidian6.Menu();
  menu.setUseNativeMenu(false);
  menuDom(menu)?.classList.add(MENU_CLASS);
  const listeners = [];
  hideListeners.set(menu, listeners);
  menu.onHide(() => listeners.forEach((listener) => listener()));
  return menu;
}
function whenHidden(menu, listener) {
  const listeners = hideListeners.get(menu);
  if (listeners) listeners.push(listener);
  else menu.onHide(listener);
}
function addEntry(menu, entry) {
  let added;
  menu.addItem((item) => {
    added = item;
    item.setTitle(entry.title).setIcon(resolveIcon(entry.icon));
    if (entry.disabled) item.setDisabled(true);
    else item.onClick(entry.action);
  });
  return added;
}
function addSubmenu(menu, title, icon, entries, disabled = false) {
  menu.addItem((item) => {
    item.setTitle(title).setIcon(resolveIcon(icon));
    if (disabled) {
      item.setDisabled(true);
      return;
    }
    const itemDom = menuItemDom(item);
    if (!itemDom) {
      const fallback = entries.find((entry) => !entry.disabled);
      if (fallback) item.onClick(fallback.action);
      return;
    }
    const arrow = document.createElement("span");
    arrow.className = "pagewise-submenu-arrow";
    (0, import_obsidian6.setIcon)(arrow, "chevron-right");
    itemDom.append(arrow);
    let submenu = null;
    const close = () => {
      submenu?.hide();
      submenu = null;
    };
    const open = () => {
      if (submenu) return;
      submenu = createMenu();
      entries.forEach(
        (entry) => addEntry(submenu, {
          ...entry,
          action: () => {
            entry.action();
            menu.hide();
          }
        })
      );
      const rect = itemDom.getBoundingClientRect();
      submenu.showAtPosition({ x: rect.right + 4, y: rect.top });
    };
    itemDom.addEventListener("mouseenter", open);
    item.onClick(open);
    menuDom(menu)?.addEventListener("mouseover", (event) => {
      if (event.target instanceof Node && !itemDom.contains(event.target)) close();
    });
    whenHidden(menu, close);
  });
}
function addHotkeyHint(app, item, commandId) {
  const hint = hotkeyFor(app, commandId);
  const dom = menuItemDom(item);
  if (!hint || !dom) return;
  const span = document.createElement("span");
  span.className = "pagewise-hotkey";
  span.textContent = hint;
  dom.append(span);
}

// src/toolbar/formatMenus.ts
var BLOCK_COMMANDS = [
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
var CALLOUT_ICON = ["list-indent-increase", "indent"];
function fillHeadingMenu(menu, editor) {
  HEADING_LEVELS.forEach(
    (level) => addEntry(menu, { title: `Heading ${level}`, icon: [headingIcon(level)], action: () => setHeading(editor, level) })
  );
}
function fillBlocksMenu(menu, app, editor) {
  BLOCK_COMMANDS.forEach(({ title, icon, commandId }) => {
    const item = addEntry(menu, { title, icon, action: () => executeCommand(app, commandId) });
    addHotkeyHint(app, item, commandId);
  });
  const calloutEntries = (inline) => CALLOUT_TYPES.map(({ id, title, icon }) => ({ title, icon, action: () => insertCallout(editor, id, inline) }));
  addSubmenu(menu, "Callout", CALLOUT_ICON, calloutEntries(false));
  addSubmenu(menu, "Callout (inline)", CALLOUT_ICON, calloutEntries(true));
  menu.addSeparator();
  addEntry(menu, { title: "Separator", icon: [SEPARATOR_ICON], action: () => insertSeparator(editor) });
}

// src/tables/tableModel.ts
function isTableLine(line) {
  return line.includes("|");
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

// src/tables/tableEditor.ts
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

// src/toolbar/tableMenu.ts
var NEW_TABLE_COMMAND = "editor:insert-table";
var TRASH = ["trash-2", "trash"];
function fillTableMenu(menu, app, editor) {
  const located = locateTable(editor);
  const noTable = located === null;
  const noBodyRow = located?.context.bodyRow == null;
  const edit = (transform) => () => applyTableEdit(editor, transform);
  const rowEdit = (transform) => edit((model, ctx) => ctx.bodyRow === null ? null : transform(model, ctx.bodyRow));
  const align = (title, icon, alignment) => ({
    title,
    icon: [icon],
    action: edit((model, ctx) => setAlignment(model, ctx.column, ctx.columnEnd, alignment))
  });
  const newTable = addEntry(menu, {
    title: "New table",
    icon: ["table", "grid-3x3"],
    action: () => executeCommand(app, NEW_TABLE_COMMAND)
  });
  addHotkeyHint(app, newTable, NEW_TABLE_COMMAND);
  menu.addSeparator();
  addSubmenu(
    menu,
    "Align column",
    ["align-center", "align-left"],
    [align("Left", "align-left", "left"), align("Center", "align-center", "center"), align("Right", "align-right", "right")],
    noTable
  );
  addSubmenu(
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
    noTable
  );
  addSubmenu(
    menu,
    "Move",
    ["move", "move-3d"],
    [
      {
        title: "Row up",
        icon: ["move-up", "arrow-up"],
        action: rowEdit((model, row) => moveRow(model, row, -1)),
        disabled: noBodyRow
      },
      {
        title: "Row down",
        icon: ["move-down", "arrow-down"],
        action: rowEdit((model, row) => moveRow(model, row, 1)),
        disabled: noBodyRow
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
    noTable
  );
  addSubmenu(
    menu,
    "Delete",
    TRASH,
    [
      { title: "Row", icon: TRASH, action: rowEdit(deleteRow), disabled: noBodyRow },
      { title: "Column", icon: TRASH, action: edit((model, ctx) => deleteColumn(model, ctx.column)) },
      { title: "Table", icon: TRASH, action: () => deleteTable(editor) }
    ],
    noTable
  );
  menu.addSeparator();
  addSubmenu(
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
    noTable
  );
  addEntry(menu, {
    title: "Duplicate row",
    icon: ["copy-plus", "copy"],
    action: rowEdit(duplicateRow),
    disabled: noBodyRow
  });
  addEntry(menu, {
    title: "Tidy table",
    icon: ["wand-sparkles", "wand-2", "wand"],
    action: edit((model) => model),
    disabled: noTable
  });
  addEntry(menu, {
    title: "Transpose",
    icon: ["move-diagonal", "maximize-2"],
    action: edit(transpose),
    disabled: noTable
  });
}

// src/toolbar/noteToolbar.ts
var TOOLBAR_CLASS = "pagewise-toolbar";
var HOST_CLASS = "pagewise-has-toolbar";
var OVERFLOWED_CLASS = "is-overflowed";
var EMPTY_CLASS = "is-empty";
var NoteToolbar = class {
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    this.panes = /* @__PURE__ */ new Map();
    registerCustomIcons(HEADING_LEVELS);
  }
  /** Gives each open Markdown pane a toolbar exactly when the predicate says so. */
  sync(shouldShow) {
    const views = new Set(markdownViews(this.app));
    this.panes.forEach((pane, view) => {
      if (views.has(view) && view.containerEl.isConnected && shouldShow(view)) return;
      pane.destroy();
      this.panes.delete(view);
    });
    views.forEach((view) => {
      if (!shouldShow(view)) return;
      const pane = this.panes.get(view);
      if (pane) pane.attach();
      else this.panes.set(view, new PaneToolbar(this.app, view, this.actions));
    });
    this.refreshState();
  }
  /** Re-reads state shown on the bars: the Properties button's pressed state. */
  refreshState() {
    this.panes.forEach((pane) => pane.refreshState());
  }
  dispose() {
    this.panes.forEach((pane) => pane.destroy());
    this.panes.clear();
  }
};
var PaneToolbar = class {
  constructor(app, view, actions) {
    this.app = app;
    this.view = view;
    this.actions = actions;
    this.placed = [];
    /** The menu this bar has open, if any, and the button it belongs to. */
    this.openMenu = null;
    /** Whether the More menu was opened from the keyboard; menus it opens inherit that. */
    this.moreKeyboard = false;
    const doc = view.containerEl.ownerDocument;
    this.el = doc.createElement("div");
    this.el.className = TOOLBAR_CLASS;
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", "Document toolbar");
    this.el.addEventListener("mousedown", (event) => event.preventDefault());
    this.el.addEventListener("keydown", (event) => this.onKeydown(event));
    this.el.addEventListener("focusin", (event) => this.setTabStop(event.target));
    this.groupsEl = this.el.createDiv({ cls: "pagewise-toolbar-groups" });
    this.controlGroups().forEach((controls) => {
      const group = this.groupsEl.createDiv({ cls: "pagewise-toolbar-group" });
      controls.forEach((control) => {
        const button = control.fill ? this.menuButton(control.label, control.icon, control.fill) : this.commandButton(control.label, control.icon, control.run);
        group.append(button);
        this.placed.push({ control, button, group });
      });
    });
    const trailing = this.el.createDiv({ cls: "pagewise-toolbar-trailing" });
    this.moreButton = this.menuButton("More tools", ["ellipsis", "more-horizontal"], (menu) => this.fillMore(menu), false);
    this.moreButton.classList.add("pagewise-toolbar-more", OVERFLOWED_CLASS);
    this.propertiesButton = this.button("Properties", (keyboard) => void this.toggleProperties(keyboard));
    this.propertiesButton.classList.add("pagewise-toolbar-properties");
    this.propertiesButton.setAttribute("aria-pressed", "false");
    (0, import_obsidian7.setIcon)(this.propertiesButton, resolveIcon(["info"]));
    trailing.append(this.moreButton, this.propertiesButton);
    this.attach();
    this.setTabStop(this.placed[0]?.button ?? this.propertiesButton);
    const Observer = doc.defaultView?.ResizeObserver ?? ResizeObserver;
    this.observer = new Observer(() => this.fit());
    this.observer.observe(this.groupsEl);
  }
  /** Places the bar between the view header and the content; idempotent. */
  attach() {
    const container = this.view.containerEl;
    container.classList.add(HOST_CLASS);
    if (this.el.parentElement !== container || this.el.nextElementSibling !== this.view.contentEl) {
      this.view.contentEl.before(this.el);
    }
  }
  refreshState() {
    this.propertiesButton.setAttribute("aria-pressed", String(this.actions.propertiesShown(this.view)));
  }
  destroy() {
    this.observer.disconnect();
    this.openMenu?.menu.hide();
    this.el.remove();
    this.view.containerEl.classList.remove(HOST_CLASS);
  }
  /** The controls, grouped by purpose: block formats, inline formats, insertions. */
  controlGroups() {
    const { app, view } = this;
    const command = (id) => () => executeCommand(app, id);
    return [
      [
        { label: "Headings", icon: ["heading"], overflowRank: 6, fill: (menu) => fillHeadingMenu(menu, view.editor) },
        { label: "Lists and blocks", icon: ["list"], overflowRank: 5, fill: (menu) => fillBlocksMenu(menu, app, view.editor) }
      ],
      [
        { label: "Bold", icon: ["bold"], overflowRank: 8, run: command("editor:toggle-bold") },
        { label: "Italic", icon: ["italic"], overflowRank: 7, run: command("editor:toggle-italics") },
        { label: "Highlight", icon: ["highlighter", "paintbrush"], overflowRank: 4, run: command("editor:toggle-highlight") }
      ],
      [
        { label: "Insert link", icon: ["link-2", "link"], overflowRank: 3, run: command("editor:insert-link") },
        { label: "Table", icon: ["table", "grid-3x3"], overflowRank: 2, fill: (menu) => fillTableMenu(menu, app, view.editor) },
        { label: "Insert image", icon: ["image-plus", "image"], overflowRank: 1, run: command("editor:attach-file") }
      ]
    ];
  }
  /**
   * Moves controls into the More menu until the rest fit on one line. Starts from
   * everything shown each time, so the result depends only on the available width.
   */
  fit() {
    this.placed.forEach(({ button, group }) => {
      button.classList.remove(OVERFLOWED_CLASS);
      group.classList.remove(EMPTY_CLASS);
    });
    this.moreButton.classList.add(OVERFLOWED_CLASS);
    const overflowing = () => this.groupsEl.scrollWidth > this.groupsEl.clientWidth + 1;
    if (this.groupsEl.offsetParent !== null && overflowing()) {
      this.moreButton.classList.remove(OVERFLOWED_CLASS);
      const leaving = [...this.placed].sort((a, b) => a.control.overflowRank - b.control.overflowRank);
      for (const { button, group } of leaving) {
        if (!overflowing()) break;
        button.classList.add(OVERFLOWED_CLASS);
        if (Array.from(group.children).every((child) => child.classList.contains(OVERFLOWED_CLASS))) {
          group.classList.add(EMPTY_CLASS);
        }
      }
    }
    this.ensureTabStop();
  }
  /** Hidden controls in their usual order, one menu section per group. */
  fillMore(menu) {
    let lastGroup = null;
    this.placed.forEach(({ control, button, group }) => {
      if (!button.classList.contains(OVERFLOWED_CLASS)) return;
      if (lastGroup && lastGroup !== group) menu.addSeparator();
      lastGroup = group;
      const action = control.fill ? (
        // Opens the control's own menu once More has closed, at the same place.
        () => window.setTimeout(() => this.showMenu(this.moreButton, control.fill, this.moreKeyboard), 0)
      ) : () => {
        this.activatePane();
        control.run();
      };
      addEntry(menu, { title: control.label, icon: control.icon, action });
    });
  }
  async toggleProperties(keyboard) {
    this.activatePane();
    await this.actions.toggleProperties(this.view);
    this.refreshState();
    if (keyboard) this.propertiesButton.focus();
  }
  runCommand(run, keyboard) {
    this.activatePane();
    run();
    if (keyboard || !this.editorHasFocus()) this.focusNote();
  }
  /**
   * Makes this pane the active one before anything acts on it. Obsidian's editor
   * commands act on the active editor, and the Properties view follows the active
   * note, so a click in another pane's toolbar must first bring that pane forward.
   * The editor keeps its selection while unfocused, so nothing is lost.
   */
  activatePane() {
    const { workspace } = this.app;
    if (workspace.getActiveViewOfType(import_obsidian7.MarkdownView) !== this.view) {
      workspace.setActiveLeaf(this.view.leaf, { focus: true });
    }
  }
  editorHasFocus() {
    const active = this.view.containerEl.ownerDocument.activeElement;
    return !!active && this.view.contentEl.contains(active);
  }
  showMenu(button, fill, keyboard) {
    this.activatePane();
    const menu = createMenu();
    fill(menu);
    menu.setParentElement(button);
    button.setAttribute("aria-expanded", "true");
    this.openMenu = { menu, button };
    whenHidden(menu, () => {
      button.setAttribute("aria-expanded", "false");
      if (this.openMenu?.menu === menu) this.openMenu = null;
      window.setTimeout(() => this.restoreFocus(button, keyboard), 0);
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 2 }, button.ownerDocument);
  }
  restoreFocus(button, keyboard) {
    if (this.openMenu || !this.el.isConnected) return;
    const active = this.el.ownerDocument.activeElement;
    if (active?.closest(".modal-container, .prompt, .menu")) return;
    if (keyboard) button.focus();
    else if (!this.editorHasFocus()) this.focusNote();
  }
  focusNote() {
    if (this.view.getMode() === "source") this.view.editor.focus();
  }
  /** A button showing an icon and a small dropdown chevron; opens its menu below it. */
  menuButton(label, icon, fill, chevron = true) {
    const button = this.button(label, (keyboard) => {
      if (this.openMenu?.button === button) {
        this.openMenu.menu.hide();
        return;
      }
      if (button === this.moreButton) this.moreKeyboard = keyboard;
      this.showMenu(button, fill, keyboard);
    });
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    if (chevron) {
      button.classList.add("has-menu");
      button.append(iconSpan(button, "pagewise-toolbar-icon", icon), iconSpan(button, "pagewise-toolbar-chevron", ["chevron-down"]));
    } else {
      (0, import_obsidian7.setIcon)(button, resolveIcon(icon));
    }
    return button;
  }
  commandButton(label, icon, run) {
    const button = this.button(label, (keyboard) => this.runCommand(run, keyboard));
    (0, import_obsidian7.setIcon)(button, resolveIcon(icon));
    return button;
  }
  /** `keyboard` is true when Enter or Space pressed the button rather than a pointer. */
  button(label, onPress) {
    const button = this.el.ownerDocument.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-label", label);
    (0, import_obsidian7.setTooltip)(button, label, { placement: "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onPress(event.detail === 0);
    });
    return button;
  }
  // ---------- Keyboard: one tab stop, arrow keys move between visible controls ----------
  visibleButtons() {
    return Array.from(this.el.querySelectorAll("button")).filter((button) => button.offsetParent !== null);
  }
  setTabStop(target) {
    if (!(target instanceof HTMLElement) || !target.matches("button")) return;
    this.el.querySelectorAll("button").forEach((button) => button.tabIndex = button === target ? 0 : -1);
  }
  /** Keeps the bar reachable by Tab when its current tab stop is hidden. */
  ensureTabStop() {
    const visible = this.visibleButtons();
    if (!visible.some((button) => button.tabIndex === 0) && visible.length > 0) this.setTabStop(visible[0]);
  }
  onKeydown(event) {
    const buttons = this.visibleButtons();
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    const next = event.key === "ArrowRight" ? buttons[(index + 1) % buttons.length] : event.key === "ArrowLeft" ? buttons[(index - 1 + buttons.length) % buttons.length] : event.key === "Home" ? buttons[0] : event.key === "End" ? buttons[buttons.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    this.setTabStop(next);
    next.focus();
  }
};
function iconSpan(owner, className, icon) {
  const span = owner.ownerDocument.createElement("span");
  span.className = className;
  (0, import_obsidian7.setIcon)(span, resolveIcon(icon));
  return span;
}

// src/main.ts
var PagewisePlugin = class extends import_obsidian8.Plugin {
  constructor() {
    super(...arguments);
    /**
     * The Properties view updates a moment after the active note changes, so its
     * inspector mark and the toolbar's pressed state are read after it settles.
     */
    this.syncInspector = (0, import_obsidian8.debounce)(() => this.syncInspectorNow(), 50, true);
  }
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    this.controller = new PaginationController(this.app, this.settings);
    this.propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, {
      toggleProperties: (view) => this.propertiesSidebar.toggle(view.file),
      propertiesShown: (view) => this.propertiesSidebar.isShownFor(view.file)
    });
    this.addCommand({
      id: "toggle-paginated-view",
      name: "Toggle paginated view for this note",
      callback: () => void this.toggle()
    });
    this.addRibbonIcon("book-open", "Toggle paginated view (Pagewise)", () => void this.toggle());
    this.addSettingTab(new PagewiseSettingTab(this.app, this));
    this.registerLayoutTriggers();
    this.app.workspace.onLayoutReady(() => {
      this.controller.applySettings(this.settings);
      this.syncToolbar();
    });
  }
  onunload() {
    this.syncInspector.cancel();
    this.controller.dispose();
    this.toolbar.dispose();
    this.propertiesSidebar.dispose();
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
  /** Merges a partial change into settings, persists it, and re-applies it everywhere. */
  async updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    this.controller.applySettings(this.settings);
    this.syncToolbar();
  }
  /** Every event that can change a paginated note's layout or the set of panes. */
  registerLayoutTriggers() {
    const { workspace } = this.app;
    this.registerMarkdownPostProcessor((el) => {
      if (el.closest(".print")) return;
      this.controller.requestLayout();
    });
    this.registerEvent(
      workspace.on("file-open", () => {
        this.controller.noteOpened();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      workspace.on("layout-change", () => {
        this.controller.requestLayout();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      workspace.on("active-leaf-change", () => {
        this.controller.requestLayout();
        this.syncInspector();
      })
    );
    this.registerEvent(workspace.on("css-change", () => this.controller.requestLayout()));
    this.registerEvent(workspace.on("resize", () => this.syncInspector()));
    this.registerEvent(this.app.vault.on("rename", () => this.syncInspector()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
  }
  /** Every paginated pane carries the document toolbar; unpaginated panes carry none. */
  syncToolbar() {
    this.toolbar.sync((view) => this.controller.isPaginated(view));
    this.syncInspector();
  }
  /** Marks the Properties views showing paginated notes, and updates the toolbars' Properties state. */
  syncInspectorNow() {
    const paginated = /* @__PURE__ */ new Set();
    markdownViews(this.app).forEach((view) => {
      if (view.file && this.controller.isPaginated(view)) paginated.add(view.file.path);
    });
    this.propertiesSidebar.syncInspectors(paginated);
    this.toolbar.refreshState();
  }
};
