import { layoutBlocks, planLayout } from "./layoutEngine";
import type { PageMetrics } from "./pageSizes";
import { DOM } from "../obsidianDom";

/** Spacer elements older versions put in the sizer; a layout removes any it finds. */
const LEGACY_SPACERS = ":scope > .pagewise-break, :scope > .pagewise-tail";
/** Marks the block that starts a new page; the stylesheet draws the gap and page number above it. */
const START_CLASS = "pagewise-page-start";
/** The number of the page a break closes. */
const PAGE_ATTRIBUTE = "data-pagewise-page";
/** On a page-start block: the margin above it (the rest of the page, then the gap). */
const SPACE_VAR = "--pagewise-break-space";
/** On a page-start block: the space Obsidian's own layout already left above it. */
const GAP_VAR = "--pagewise-break-gap";
/** On the sizer: the height that fills the last page, and that page's number. */
const TAIL_VAR = "--pagewise-tail";
const LAST_PAGE_VAR = "--pagewise-last-page";

/**
 * Applies a layout plan to one preview sizer. A page break is a margin above the
 * block that starts the next page, set on that block, Obsidian's own section element,
 * as a CSS variable; the last page's fill is a variable on the sizer. Pagewise adds
 * no elements of its own: Reading view rebuilds the sizer's children from its list of
 * sections whenever it redraws, and it keeps those section elements, so a break
 * travels with its block and Obsidian measures each section with the space above
 * the next one included.
 *
 * Reading view renders long notes lazily and calls the Markdown post-processor
 * for each section it renders, so layout requests arrive in bursts while the user
 * scrolls. The paginator remembers what it last laid out (which children, their
 * heights, the page metrics and the sizer's width) and leaves the breaks alone
 * when none of that changed.
 */
export class Paginator {
  private lastKey: string | null = null;
  /** A stable id per child element, so a re-rendered section counts as a change. */
  private readonly ids = new WeakMap<HTMLElement, number>();
  private nextId = 0;
  /** Every block that carries a break now, attached or not, so clear() can reach them all. */
  private readonly marked = new Set<HTMLElement>();

  constructor(private readonly sizer: HTMLElement) {}

  /** Measures the natural layout, computes breaks, and marks the blocks that start pages. */
  apply(metrics: PageMetrics): void {
    const children = this.blocks();
    // Margins above a block leave its height alone, so the check runs before the breaks are removed.
    const key = this.layoutKey(children, metrics);
    if (key === this.lastKey && this.marksIntact()) return;
    this.clear();
    if (children.length === 0) return;
    const contentTop = this.sizer.getBoundingClientRect().top + this.contentInset();
    const rects = children.map((el) => el.getBoundingClientRect());
    const { indexes, blocks } = layoutBlocks(
      children.map((el, i) => ({ top: rects[i].top, height: rects[i].height, placeholder: el.matches(DOM.previewPusher) })),
      contentTop
    );
    const plan = planLayout({
      blocks,
      contentHeight: metrics.contentHeightPx,
      breakHeight: 2 * metrics.marginPx + metrics.gapPx,
    });
    let page = 0;
    plan.breaksBefore.forEach((height, index) => {
      if (height <= 0) return;
      page += 1;
      const at = indexes[index];
      // The margins that meet above this block collapse into one gap today. A margin
      // of the break plus that gap outgrows them all, so the block moves down by
      // exactly the break, as the plan assumes.
      const gap = at > 0 ? Math.max(0, rects[at].top - rects[at - 1].bottom) : 0;
      this.mark(children[at], height, gap, page);
    });
    this.sizer.setCssProps({ [TAIL_VAR]: `${plan.tailPadding + metrics.marginPx}px`, [LAST_PAGE_VAR]: `"${page + 1}"` });
    this.lastKey = key;
  }

  /** Removes every break and the last page's fill. */
  clear(): void {
    this.lastKey = null;
    this.marked.forEach((el) => {
      el.classList.remove(START_CLASS);
      el.removeAttribute(PAGE_ATTRIBUTE);
      el.setCssProps({ [SPACE_VAR]: "", [GAP_VAR]: "" });
    });
    this.marked.clear();
    this.sizer.setCssProps({ [TAIL_VAR]: "", [LAST_PAGE_VAR]: "" });
    this.sizer.querySelectorAll(LEGACY_SPACERS).forEach((el) => el.remove());
  }

  /** The sizer's children: the blocks a layout measures. */
  blocks(): HTMLElement[] {
    return Array.from(this.sizer.children).filter(
      (el): el is HTMLElement => el.instanceOf(HTMLElement) && !el.matches(".pagewise-break, .pagewise-tail")
    );
  }

  private mark(el: HTMLElement, space: number, gap: number, page: number): void {
    el.classList.add(START_CLASS);
    el.setAttribute(PAGE_ATTRIBUTE, String(page));
    el.setCssProps({ [SPACE_VAR]: `${space + gap}px`, [GAP_VAR]: `${gap}px` });
    this.marked.add(el);
  }

  /** False when Obsidian redrew a block in place and dropped its mark. */
  private marksIntact(): boolean {
    for (const el of this.marked) if (!el.classList.contains(START_CLASS)) return false;
    return true;
  }

  /** What a layout depends on: each child and its height, the page metrics, and the sizer's width. */
  private layoutKey(children: readonly HTMLElement[], metrics: PageMetrics): string {
    const ids = children.map((el) => `${this.childId(el)}:${Math.round(el.getBoundingClientRect().height)}`);
    return JSON.stringify([this.sizer.clientWidth, metrics, ids]);
  }

  private childId(el: HTMLElement): number {
    let id = this.ids.get(el);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(el, id);
    }
    return id;
  }

  /** Top padding of the sizer, which is the page's top margin once Pagewise styling is active. */
  private contentInset(): number {
    return parseFloat(this.sizer.win.getComputedStyle(this.sizer).paddingTop) || 0;
  }
}
