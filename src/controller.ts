import { App, MarkdownView, Notice, debounce, type Debouncer } from "obsidian";
import { Paginator } from "./paginator";
import { PropertiesCollapser } from "./propertiesCollapser";
import { pageSizeById, resolveMetrics, type PageMetrics } from "./pageSizes";
import type { PagewiseSettings } from "./settings";

const ACTIVE_CLASS = "pagewise-active";
const HIDE_PROPS_CLASS = "pagewise-props-hidden";
const SIZER_SELECTOR = ".markdown-preview-sizer";
const RELAYOUT_DELAY_MS = 120;

/**
 * Owns which panes are paginated and keeps their layout current. All entry points
 * funnel into one debounced layout pass, so bursts of render, resize, and metadata
 * events cost one re-layout. While suspended (print or PDF export in progress) the
 * controller does no DOM work at all: no measurement, no mutation, no observation.
 */
export class PaginationController {
  private readonly active = new Set<MarkdownView>();
  private readonly paginators = new WeakMap<HTMLElement, Paginator>();
  private readonly observers = new Map<HTMLElement, ResizeObserver>();
  private readonly properties = new PropertiesCollapser();
  private readonly relayout: Debouncer<[], void>;
  private metrics: PageMetrics;
  private suspended = false;
  private pendingFrame: number | null = null;

  constructor(
    private readonly app: App,
    private settings: PagewiseSettings
  ) {
    this.metrics = metricsFrom(settings);
    this.publishGeometry();
    this.relayout = debounce(() => this.layoutActiveViews(), RELAYOUT_DELAY_MS, true);
  }

  /** Toggles the paginated view for the note in focus; a no-op outside Markdown panes. */
  toggleActiveView(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Pagewise: no active note to paginate.");
      return;
    }
    this.active.has(view) ? this.deactivate(view) : this.activate(view);
  }

  /** Re-reads geometry from new settings, syncs global scope, and re-applies active panes. */
  applySettings(settings: PagewiseSettings): void {
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
  noteOpened(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (this.settings.scope === "global") {
      this.settings.globalEnabled ? this.activate(view) : this.deactivate(view);
      return;
    }
    if (this.active.has(view)) this.deactivate(view);
  }

  /** True while the given pane is showing the paginated view. */
  isPaginated(view: MarkdownView): boolean {
    return this.active.has(view);
  }

  /** Schedules a debounced re-layout of all active panes; safe from any render or resize event. */
  requestLayout(): void {
    if (this.suspended) return;
    if (this.active.size > 0) this.relayout();
  }

  /**
   * Halts every source of DOM work for the duration of a print or PDF export:
   * cancels the debounced pass and any pending animation frame, disconnects the
   * resize observers, and strips the page spacers so the exporter sees the note
   * in its natural flow. Pane activation state is kept for resume(). Idempotent.
   */
  suspend(): void {
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
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.requestLayout();
  }

  dispose(): void {
    this.relayout.cancel();
    this.cancelPendingFrame();
    this.suspended = false;
    [...this.active].forEach((view) => this.deactivate(view));
  }

  /** Brings every open Markdown pane in line with the persisted global state. */
  private syncGlobal(): void {
    const views = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView);
    views.forEach((view) => (this.settings.globalEnabled ? this.activate(view) : this.deactivate(view)));
  }

  private activate(view: MarkdownView): void {
    if (this.active.has(view)) return;
    this.active.add(view);
    view.containerEl.classList.add(ACTIVE_CLASS);
    this.applyPropertiesMode(view);
    this.layoutActiveViews();
  }

  private deactivate(view: MarkdownView): void {
    if (!this.active.delete(view)) return;
    view.containerEl.classList.remove(ACTIVE_CLASS, HIDE_PROPS_CLASS);
    this.properties.restore([view]);
    const sizer = this.sizerOf(view);
    if (!sizer) return;
    this.paginators.get(sizer)?.clear();
    this.observers.get(sizer)?.disconnect();
    this.observers.delete(sizer);
  }

  private layoutActiveViews(): void {
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
  private applyPropertiesMode(view: MarkdownView): void {
    view.containerEl.classList.toggle(HIDE_PROPS_CLASS, this.settings.propertiesMode === "sidebar");
  }

  /** Geometry lives on <body> as CSS variables; they are inert until a pane carries ACTIVE_CLASS. */
  private publishGeometry(): void {
    const { style } = document.body;
    style.setProperty("--pagewise-page-width", `${this.metrics.pageWidthPx}px`);
    style.setProperty("--pagewise-page-height", `${this.metrics.pageHeightPx}px`);
    style.setProperty("--pagewise-margin", `${this.metrics.marginPx}px`);
    style.setProperty("--pagewise-gap", `${this.metrics.gapPx}px`);
  }

  private paginatorFor(sizer: HTMLElement): Paginator {
    let paginator = this.paginators.get(sizer);
    if (!paginator) {
      paginator = new Paginator(sizer);
      this.paginators.set(sizer, paginator);
    }
    return paginator;
  }

  /** Watches the sizer's width so wrapping changes (pane resize, sidebar toggle) trigger a re-layout. */
  private observe(sizer: HTMLElement): void {
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
  private pruneClosedViews(): void {
    this.active.forEach((view) => {
      if (!view.containerEl.isConnected) this.active.delete(view);
    });
    this.observers.forEach((observer, sizer) => {
      if (sizer.isConnected) return;
      observer.disconnect();
      this.observers.delete(sizer);
    });
  }

  private cancelPendingFrame(): void {
    if (this.pendingFrame === null) return;
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = null;
  }

  private sizerOf(view: MarkdownView): HTMLElement | null {
    return view.previewMode.containerEl.querySelector<HTMLElement>(SIZER_SELECTOR);
  }
}

function metricsFrom(settings: PagewiseSettings): PageMetrics {
  return resolveMetrics(pageSizeById(settings.pageSize), settings.marginMm, settings.gapPx);
}
