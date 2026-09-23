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
var import_obsidian7 = require("obsidian");

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
    this.suspended = false;
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
  /** Returns every pane to Obsidian's own view and removes all Pagewise state from the DOM. */
  dispose() {
    this.relayout.cancel();
    this.cancelPendingFrame();
    this.suspended = false;
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

// src/properties/propertiesSidebar.ts
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
var DEFAULT_SETTINGS = {
  scope: "note",
  globalEnabled: false,
  pageSize: "a4",
  marginMm: 25.4,
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
var import_obsidian3 = require("obsidian");
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

// src/toolbar/noteToolbar.ts
var import_obsidian6 = require("obsidian");

// src/toolbar/anchor.ts
var FIND_BAR_SELECTOR = ".document-search-container";
var CONTENT_VIEW_SELECTOR = ":scope > .markdown-source-view, :scope > .markdown-reading-view";
var HANDLE_SELECTOR = ".pagewise-toolbar-handle";
var TOP_INSET_PX = 10;
var PAGE_CLEARANCE_PX = 12;
var EDGE_MIN_PX = 8;
var COLLAPSED_PADDING_PX = 6;
function anchorBar(bar, host) {
  const pageWidth = parseFloat(getComputedStyle(document.body).getPropertyValue("--pagewise-page-width"));
  if (!Number.isFinite(pageWidth)) return;
  const pageLeft = (host.clientWidth - pageWidth) / 2;
  const handle = bar.querySelector(HANDLE_SELECTOR);
  const collapsedWidth = (handle?.offsetWidth ?? bar.offsetWidth) + COLLAPSED_PADDING_PX;
  bar.style.left = `${Math.max(EDGE_MIN_PX, pageLeft - collapsedWidth - PAGE_CLEARANCE_PX)}px`;
  bar.style.top = `${findBarBottom(host, bar) + TOP_INSET_PX}px`;
}
function watchAnchor(host, onChange) {
  const resize = new ResizeObserver(onChange);
  const watchFindBars = () => host.querySelectorAll(FIND_BAR_SELECTOR).forEach((el) => resize.observe(el));
  resize.observe(host);
  watchFindBars();
  const mutation = new MutationObserver(() => {
    watchFindBars();
    onChange();
  });
  mutation.observe(host, { childList: true });
  host.querySelectorAll(CONTENT_VIEW_SELECTOR).forEach((el) => mutation.observe(el, { childList: true }));
  return {
    disconnect: () => {
      resize.disconnect();
      mutation.disconnect();
    }
  };
}
function findBarBottom(host, bar) {
  const hostRect = host.getBoundingClientRect();
  const barLeft = parseFloat(bar.style.left) || 0;
  const barRight = barLeft + bar.offsetWidth;
  let bottom = 0;
  host.querySelectorAll(FIND_BAR_SELECTOR).forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;
    const left = rect.left - hostRect.left;
    const right = rect.right - hostRect.left;
    if (right <= barLeft || left >= barRight) return;
    bottom = Math.max(bottom, rect.bottom - hostRect.top);
  });
  return bottom;
}

// src/toolbar/icons.ts
var import_obsidian4 = require("obsidian");
var HEADING_ICON_PREFIX = "pagewise-heading-";
var SEPARATOR_ICON = "pagewise-separator";
function headingIcon(level) {
  return `${HEADING_ICON_PREFIX}${level}`;
}
function registerCustomIcons(levels) {
  levels.forEach((level) => {
    (0, import_obsidian4.addIcon)(
      headingIcon(level),
      `<rect x="14" y="14" width="72" height="72" rx="16" fill="none" stroke="currentColor" stroke-width="7"/><text x="50" y="68" text-anchor="middle" font-size="48" font-weight="600" fill="currentColor">${level}</text>`
    );
  });
  (0, import_obsidian4.addIcon)(
    SEPARATOR_ICON,
    '<circle cx="16" cy="50" r="9" fill="currentColor"/><line x1="34" y1="50" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'
  );
}
function resolveIcon(icons) {
  return icons.find((name) => (0, import_obsidian4.getIcon)(name)) ?? icons[icons.length - 1];
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
var import_obsidian5 = require("obsidian");
var MENU_CLASS = "pagewise-menu";
function createMenu() {
  const menu = new import_obsidian5.Menu();
  menu.setUseNativeMenu(false);
  menuDom(menu)?.classList.add(MENU_CLASS);
  return menu;
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
    (0, import_obsidian5.setIcon)(arrow, "chevron-right");
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
    menu.onHide(close);
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
var EXPANDED_CLASS = "is-expanded";
var VERTICAL_CLASS = "is-vertical";
var COLLAPSE_DELAY_MS = 5e3;
var NoteToolbar = class {
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    this.watches = /* @__PURE__ */ new Map();
    /** Direction bars are built for; sync() rebuilds any bar built for the other one. */
    this.vertical = false;
    registerCustomIcons(HEADING_LEVELS);
  }
  /** Ensures each open Markdown pane has a toolbar exactly when the predicate says so. */
  sync(shouldShow, direction) {
    this.vertical = direction === "vertical";
    this.releaseClosedPanes();
    markdownViews(this.app).forEach((view) => {
      const host = view.contentEl;
      let bar = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
      if (!shouldShow(view)) {
        this.detach(host, bar);
        return;
      }
      if (bar && bar.classList.contains(VERTICAL_CLASS) !== this.vertical) {
        bar.remove();
        bar = null;
      }
      if (!bar) {
        host.classList.add(HOST_CLASS);
        bar = this.build(view);
        host.append(bar);
      }
      anchorBar(bar, host);
      this.watch(host);
    });
  }
  /** Stops all observation during a print or PDF export; the next sync() resumes it. */
  suspend() {
    this.watches.forEach((watch) => watch.disconnect());
    this.watches.clear();
  }
  dispose() {
    this.suspend();
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.classList.remove(HOST_CLASS));
  }
  detach(host, bar) {
    bar?.remove();
    host.classList.remove(HOST_CLASS);
    this.watches.get(host)?.disconnect();
    this.watches.delete(host);
  }
  watch(host) {
    if (this.watches.has(host)) return;
    this.watches.set(
      host,
      watchAnchor(host, () => {
        const bar = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
        if (bar) anchorBar(bar, host);
      })
    );
  }
  /** A closed pane leaves a detached host; release its watch so the map cannot grow without bound. */
  releaseClosedPanes() {
    this.watches.forEach((watch, host) => {
      if (host.isConnected) return;
      watch.disconnect();
      this.watches.delete(host);
    });
  }
  build(view) {
    const bar = document.createElement("div");
    bar.className = TOOLBAR_CLASS;
    bar.classList.toggle(VERTICAL_CLASS, this.vertical);
    bar.addEventListener("mousedown", (event) => event.preventDefault());
    const command = (id) => () => executeCommand(this.app, id);
    const format = document.createElement("div");
    format.className = "pagewise-toolbar-format";
    format.append(
      this.menuButton(["heading"], "Headings", (menu) => fillHeadingMenu(menu, view.editor)),
      this.menuButton(["list"], "Lists and blocks", (menu) => fillBlocksMenu(menu, this.app, view.editor)),
      this.iconButton(["bold"], "Bold", command("editor:toggle-bold")),
      this.iconButton(["italic"], "Italic", command("editor:toggle-italics")),
      this.iconButton(["paintbrush-vertical", "paintbrush-2", "paintbrush"], "Highlight", command("editor:toggle-highlight")),
      this.iconButton(["link-2", "link"], "Insert link", command("editor:insert-link")),
      this.menuButton(["grid-3x3", "grid", "table"], "Table", (menu) => fillTableMenu(menu, this.app, view.editor)),
      this.iconButton(["image-plus", "image"], "Insert image", command("editor:attach-file"))
    );
    const content = document.createElement("div");
    content.className = "pagewise-toolbar-content";
    content.append(format, this.iconButton(["info"], "Toggle properties sidebar", () => this.actions.toggleProperties()));
    const reveal = document.createElement("div");
    reveal.className = "pagewise-toolbar-reveal";
    reveal.append(content);
    bar.append(this.handleButton(bar), reveal);
    wireCollapse(bar);
    return bar;
  }
  /** The always-visible handle: a plus circle at rest, a chevron circle while expanded. */
  handleButton(bar) {
    const button = this.button("Formatting tools", () => bar.classList.toggle(EXPANDED_CLASS));
    button.classList.add("pagewise-toolbar-handle");
    button.append(
      iconSpan("pagewise-handle-icon is-plus", ["circle-plus", "plus-circle"]),
      iconSpan("pagewise-handle-icon is-chevron", ["circle-chevron-right", "chevron-right-circle"])
    );
    return button;
  }
  /**
   * A button showing an icon and a dropdown chevron. Its menu opens under the pointer
   * in horizontal mode, and at the button's right edge in vertical mode so it never
   * covers the controls below.
   */
  menuButton(icon, label, fill) {
    const button = this.button(label, (event) => {
      const menu = createMenu();
      fill(menu);
      if (this.vertical) {
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right + 6, y: rect.top });
      } else {
        menu.showAtMouseEvent(event);
      }
    });
    button.classList.add("has-menu");
    button.append(iconSpan("pagewise-chevron", icon), iconSpan("pagewise-chevron", ["chevron-down"]));
    return button;
  }
  iconButton(icon, label, onClick) {
    const button = this.button(label, onClick);
    (0, import_obsidian6.setIcon)(button, resolveIcon(icon));
    return button;
  }
  button(label, onClick) {
    const button = document.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.setAttribute("aria-label", label);
    (0, import_obsidian6.setTooltip)(button, label, { placement: this.vertical ? "right" : "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
    return button;
  }
};
function wireCollapse(bar) {
  let timer = null;
  const cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  bar.addEventListener("mouseenter", () => {
    cancel();
    bar.classList.add(EXPANDED_CLASS);
  });
  bar.addEventListener("mouseleave", () => {
    cancel();
    timer = window.setTimeout(() => bar.classList.remove(EXPANDED_CLASS), COLLAPSE_DELAY_MS);
  });
}
function iconSpan(className, icon) {
  const span = document.createElement("span");
  span.className = className;
  (0, import_obsidian6.setIcon)(span, resolveIcon(icon));
  return span;
}

// src/main.ts
var PagewisePlugin = class extends import_obsidian7.Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    this.controller = new PaginationController(this.app, this.settings);
    const propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, { toggleProperties: () => propertiesSidebar.toggle() });
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
    this.registerLayoutTriggers();
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
      if (this.printGuard.isPrinting() || el.closest(".print")) return;
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
    this.registerEvent(workspace.on("active-leaf-change", () => this.controller.requestLayout()));
    this.registerEvent(workspace.on("css-change", () => this.controller.requestLayout()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
  }
  /** Every paginated pane carries the note toolbar; unpaginated panes carry none. */
  syncToolbar() {
    this.toolbar.sync((view) => this.controller.isPaginated(view), this.settings.toolbarDirection);
  }
};
