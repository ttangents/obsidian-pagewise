/**
 * Where the toolbar sits in its pane, and what makes it move. The collapsed handle
 * anchors just outside the sheet's left edge, below anything (the find bar) that
 * would cover it. Kept apart from the toolbar's contents so layout rules change here
 * and nowhere else.
 */

/** Obsidian's in-note find bar (Ctrl/Cmd-F); its place in the pane varies by version and theme. */
const FIND_BAR_SELECTOR = ".document-search-container";
/** The pane's two content views; only the one for the current mode is displayed. */
const CONTENT_VIEW_SELECTOR = ":scope > .markdown-source-view, :scope > .markdown-reading-view";
const HANDLE_SELECTOR = ".pagewise-toolbar-handle";
const TOP_INSET_PX = 10;
const PAGE_CLEARANCE_PX = 12;
const EDGE_MIN_PX = 8;
/** The collapsed bar's padding, both sides combined (3px each, set in styles.css). */
const COLLAPSED_PADDING_PX = 6;

/** Observers keeping one pane's toolbar anchored, released together. */
export interface AnchorWatch {
  disconnect(): void;
}

/**
 * Places the bar 12px left of the sheet (clamped to the pane edge), measured from
 * the collapsed handle so the handle stays put while the tray expands and collapses.
 */
export function anchorBar(bar: HTMLElement, host: HTMLElement): void {
  const pageWidth = parseFloat(getComputedStyle(document.body).getPropertyValue("--pagewise-page-width"));
  if (!Number.isFinite(pageWidth)) return;
  const pageLeft = (host.clientWidth - pageWidth) / 2;
  const handle = bar.querySelector<HTMLElement>(HANDLE_SELECTOR);
  const collapsedWidth = (handle?.offsetWidth ?? bar.offsetWidth) + COLLAPSED_PADDING_PX;
  bar.style.left = `${Math.max(EDGE_MIN_PX, pageLeft - collapsedWidth - PAGE_CLEARANCE_PX)}px`;
  bar.style.top = `${findBarBottom(host, bar) + TOP_INSET_PX}px`;
}

/**
 * Calls `onChange` whenever the bar may need re-anchoring: the pane resizes, or the
 * find bar opens, closes, or changes height (find vs. find-and-replace). Obsidian
 * creates the find bar lazily, so a child-list watch on the pane and its content
 * views catches its arrival and adds it to the resize watch. The child-list watch
 * is shallow, so typing in the editor never triggers it.
 */
export function watchAnchor(host: HTMLElement, onChange: () => void): AnchorWatch {
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
    },
  };
}

/**
 * How far down the pane a displayed find bar reaches over the toolbar's column, or 0.
 * A find bar floating elsewhere (some themes pin it top-right) leaves the bar alone.
 */
function findBarBottom(host: HTMLElement, bar: HTMLElement): number {
  const hostRect = host.getBoundingClientRect();
  const barLeft = parseFloat(bar.style.left) || 0;
  const barRight = barLeft + bar.offsetWidth;
  let bottom = 0;
  host.querySelectorAll<HTMLElement>(FIND_BAR_SELECTOR).forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;
    const left = rect.left - hostRect.left;
    const right = rect.right - hostRect.left;
    if (right <= barLeft || left >= barRight) return;
    bottom = Math.max(bottom, rect.bottom - hostRect.top);
  });
  return bottom;
}
