import { App, MarkdownView, Notice, debounce, type Debouncer, type TFile } from "obsidian";
import { noteAction } from "./noteScope";
import { Paginator } from "./paginator";
import { BlockWatcher, resizeObserverFor } from "./blockWatcher";
import { pageSizeById, resolveMetrics, type PageMetrics } from "./pageSizes";
import type { PagewiseSettings } from "../settings";
import { markdownViews } from "../workspace";
import { DOM } from "../obsidianDom";
import { setReadingBottomPadding } from "../obsidianInternals";

const ACTIVE_CLASS = "pagewise-active";
const HIDE_PROPS_CLASS = "pagewise-props-hidden";
/** Marks a paginated pane whose callouts Pagewise draws as cards (D25). */
const CALLOUT_CARDS_CLASS = "pagewise-callout-cards";
const RELAYOUT_DELAY_MS = 120;
/** Page geometry, set on each paginated pane's container so pop-out windows get it too. */
const GEOMETRY_VARS = ["--pagewise-page-width", "--pagewise-page-height", "--pagewise-margin", "--pagewise-gap"] as const;

/** Folds the in-note Properties panel while a pane is paginated; main.ts supplies it (PropertiesCollapser). */
export interface PropertiesFolder {
  /** Folds every panel not yet seen. @returns true when a panel changed state. */
  collapse(views: MarkdownView[]): boolean;
  /** Forgets the panels of these panes, without touching their state. */
  forget(views: MarkdownView[]): void;
  /** Unfolds the panels it folded in these panes. */
  restore(views: MarkdownView[]): void;
}

/**
 * Owns which panes are paginated and keeps their layout current. All entry points
 * funnel into one debounced layout pass, so bursts of render, resize, and metadata
 * events cost one re-layout.
 */
export class PaginationController {
  private readonly active = new Set<MarkdownView>();
  /** The note each paginated pane showed when it was paginated or last laid out for a new note. */
  private readonly notes = new Map<MarkdownView, TFile | null>();
  private readonly paginators = new WeakMap<HTMLElement, Paginator>();
  private readonly watchers = new Map<HTMLElement, BlockWatcher>();
  private readonly relayout: Debouncer<[], void>;
  private metrics: PageMetrics;
  /** A layout pass waiting for the next frame, with the window that frame belongs to. */
  private pendingFrame: { win: Window; id: number } | null = null;

  constructor(
    private readonly app: App,
    private settings: PagewiseSettings,
    private readonly properties: PropertiesFolder
  ) {
    this.metrics = metricsFrom(settings);
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
    this.active.forEach((view) => this.setGeometry(view));
    if (settings.scope === "global") this.syncGlobal();
    if (settings.propertiesMode !== "collapse") this.properties.restore([...this.active]);
    this.active.forEach((view) => this.applyPresentation(view));
    this.requestLayout();
  }

  /**
   * Brings every Markdown pane in line with the toggle scope after notes open, close
   * or change (file-open and layout-change). Each pane is judged by its own note,
   * never by which pane happens to be active, so a tab that another plugin or the
   * user opens beside a paginated note leaves that note paginated.
   */
  reconcile(): void {
    this.pruneClosedViews();
    markdownViews(this.app).forEach((view) => {
      const paginated = this.active.has(view);
      const noteChanged = paginated && this.notes.get(view) !== view.file;
      switch (noteAction(this.settings.scope, this.settings.globalEnabled, paginated, noteChanged)) {
        case "activate":
          this.activate(view);
          break;
        case "deactivate":
          this.deactivate(view);
          break;
        case "relayout":
          // Same pane, new note: Obsidian reuses the Properties element, so let the
          // collapser treat it as unseen, then lay the new note out.
          this.notes.set(view, view.file);
          this.properties.forget([view]);
          this.requestLayout();
          break;
        case "keep":
          break;
      }
    });
  }

  /** True while the given pane is showing the paginated view. */
  isPaginated(view: MarkdownView): boolean {
    return this.active.has(view);
  }

  /** Schedules a debounced re-layout of all active panes; safe from any render or resize event. */
  requestLayout(): void {
    if (this.active.size > 0) this.relayout();
  }

  /** Returns every pane to Obsidian's own view and removes all Pagewise state from the DOM. */
  dispose(): void {
    this.relayout.cancel();
    this.cancelPendingFrame();
    [...this.active].forEach((view) => this.deactivate(view));
  }

  /** Brings every open Markdown pane in line with the persisted global state. */
  private syncGlobal(): void {
    markdownViews(this.app).forEach((view) => (this.settings.globalEnabled ? this.activate(view) : this.deactivate(view)));
  }

  private activate(view: MarkdownView): void {
    if (this.active.has(view)) return;
    this.active.add(view);
    this.notes.set(view, view.file);
    view.containerEl.classList.add(ACTIVE_CLASS);
    // The last sheet ends at its last page; the tail spacer carries the bottom margin.
    setReadingBottomPadding(view, false);
    this.setGeometry(view);
    this.applyPresentation(view);
    this.layoutActiveViews();
  }

  private deactivate(view: MarkdownView): void {
    if (!this.active.delete(view)) return;
    this.notes.delete(view);
    view.containerEl.classList.remove(ACTIVE_CLASS, HIDE_PROPS_CLASS, CALLOUT_CARDS_CLASS);
    GEOMETRY_VARS.forEach((name) => view.containerEl.style.removeProperty(name));
    setReadingBottomPadding(view, true);
    this.properties.restore([view]);
    const sizer = this.sizerOf(view);
    if (!sizer) return;
    this.paginators.get(sizer)?.clear();
    this.watchers.get(sizer)?.dispose();
    this.watchers.delete(sizer);
  }

  private layoutActiveViews(): void {
    this.pruneClosedViews();
    const views = [...this.active];
    if (this.settings.propertiesMode === "collapse" && this.properties.collapse(views)) {
      this.cancelPendingFrame();
      // The frame of the window the panes are in; a pop-out paints on its own schedule.
      const win = views[0]?.containerEl.win ?? window;
      const id = win.requestAnimationFrame(() => {
        this.pendingFrame = null;
        this.layoutActiveViews();
      });
      this.pendingFrame = { win, id };
      return;
    }
    views.forEach((view) => {
      const sizer = this.sizerOf(view);
      if (!sizer) return;
      const paginator = this.paginatorFor(sizer);
      paginator.apply(this.metrics);
      this.watcherFor(sizer).track(paginator.blocks());
    });
  }

  /**
   * Marks the pane for the stylesheet's settings-driven presentation: dropping the
   * in-note Properties panel in sidebar mode, and drawing callouts as cards.
   */
  private applyPresentation(view: MarkdownView): void {
    view.containerEl.classList.toggle(HIDE_PROPS_CLASS, this.settings.propertiesMode === "sidebar");
    view.containerEl.classList.toggle(CALLOUT_CARDS_CLASS, this.settings.calloutStyle === "cards");
  }

  /** Puts the page geometry on the pane's container as CSS variables; deactivate() removes them. */
  private setGeometry(view: MarkdownView): void {
    const { pageWidthPx, pageHeightPx, marginPx, gapPx } = this.metrics;
    const values = [pageWidthPx, pageHeightPx, marginPx, gapPx];
    GEOMETRY_VARS.forEach((name, i) => view.containerEl.style.setProperty(name, `${values[i]}px`));
  }

  private paginatorFor(sizer: HTMLElement): Paginator {
    let paginator = this.paginators.get(sizer);
    if (!paginator) {
      paginator = new Paginator(sizer);
      this.paginators.set(sizer, paginator);
    }
    return paginator;
  }

  /**
   * The watcher that re-lays out a sheet when its width changes or a block resizes
   * after it was measured: content that other plugins draw late (Dataview, Tasks,
   * Excalidraw), Mermaid diagrams and images.
   */
  private watcherFor(sizer: HTMLElement): BlockWatcher {
    let watcher = this.watchers.get(sizer);
    if (!watcher) {
      watcher = new BlockWatcher(sizer, resizeObserverFor(sizer), () => this.requestLayout());
      this.watchers.set(sizer, watcher);
    }
    return watcher;
  }

  /** A closed pane leaves a detached container; drop its state so the sets cannot grow without bound. */
  private pruneClosedViews(): void {
    this.active.forEach((view) => {
      if (view.containerEl.isConnected) return;
      this.active.delete(view);
      this.notes.delete(view);
    });
    this.watchers.forEach((watcher, sizer) => {
      if (sizer.isConnected) return;
      watcher.dispose();
      this.watchers.delete(sizer);
    });
  }

  private cancelPendingFrame(): void {
    if (this.pendingFrame === null) return;
    this.pendingFrame.win.cancelAnimationFrame(this.pendingFrame.id);
    this.pendingFrame = null;
  }

  private sizerOf(view: MarkdownView): HTMLElement | null {
    return view.previewMode.containerEl.querySelector<HTMLElement>(DOM.previewSizer);
  }
}

function metricsFrom(settings: PagewiseSettings): PageMetrics {
  return resolveMetrics(pageSizeById(settings.pageSize), settings.marginMm, settings.gapPx);
}
