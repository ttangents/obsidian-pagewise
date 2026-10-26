import type { MarkdownView } from "obsidian";
import { setMetadataCollapsed } from "../obsidianInternals";
import { DOM } from "../obsidianDom";

const CONTAINER_SELECTOR = DOM.metadataContainer;
const COLLAPSED_CLASS = DOM.collapsedClass;
const INDICATOR_SELECTOR = DOM.metadataIndicator;

/**
 * Collapses the in-note Properties panel while pagination is on, and restores
 * exactly what it changed when pagination turns off. Panels the user expands
 * by hand stay expanded: each container is acted on at most once per activation.
 */
export class PropertiesCollapser {
  /** Containers this collapser collapsed, so only those are expanded on restore. */
  private readonly collapsedByUs = new WeakSet<HTMLElement>();
  /** Containers seen since activation, so a user's manual re-expand is not undone. */
  private readonly seen = new WeakSet<HTMLElement>();

  /**
   * Collapses every not-yet-seen properties panel in the given views. Idempotent.
   * @returns true when at least one panel changed state in this call.
   */
  collapse(views: MarkdownView[]): boolean {
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
  forget(views: MarkdownView[]): void {
    for (const view of views) {
      for (const container of findContainers(view)) {
        this.seen.delete(container);
        this.collapsedByUs.delete(container);
      }
    }
  }

  /** Re-expands only the panels this collapser collapsed and forgets all tracked state. */
  restore(views: MarkdownView[]): void {
    for (const view of views) {
      for (const container of findContainers(view)) {
        if (this.collapsedByUs.has(container)) setCollapsed(view, container, false);
        this.collapsedByUs.delete(container);
        this.seen.delete(container);
      }
    }
  }
}

function findContainers(view: MarkdownView): HTMLElement[] {
  return Array.from(view.containerEl.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR));
}

/**
 * Live Preview owns its collapse state in the metadata editor, so going through it
 * keeps Obsidian's caret and internal state in sync; the reading view has no such
 * owner, so there the class toggle on container and indicator is the whole truth.
 */
function setCollapsed(view: MarkdownView, container: HTMLElement, collapsed: boolean): void {
  if (container.closest(DOM.sourceView) && setMetadataCollapsed(view, collapsed)) return;
  container.classList.toggle(COLLAPSED_CLASS, collapsed);
  container.querySelector(INDICATOR_SELECTOR)?.classList.toggle(COLLAPSED_CLASS, collapsed);
}
