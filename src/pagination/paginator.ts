import { layoutBlocks, planLayout } from "./layoutEngine";
import type { PageMetrics } from "./pageSizes";
import { DOM } from "../obsidianDom";

const BREAK_CLASS = "pagewise-break";
const TAIL_CLASS = "pagewise-tail";

/**
 * Applies a layout plan to one preview sizer by inserting spacer elements
 * before blocks that would overflow their page. The stylesheet paints the
 * spacers as the ground between sheets and prints the page number on them.
 *
 * Reading view renders long notes lazily and calls the Markdown post-processor
 * for each section it renders, so layout requests arrive in bursts while the user
 * scrolls. The paginator remembers what it last laid out (which children, their
 * heights, the page metrics and the sizer's width) and leaves the spacers alone
 * when none of that changed.
 */
export class Paginator {
  private lastKey: string | null = null;
  /** A stable id per child element, so a re-rendered section counts as a change. */
  private readonly ids = new WeakMap<HTMLElement, number>();
  private nextId = 0;

  constructor(private readonly sizer: HTMLElement) {}

  /** Measures the natural layout, computes breaks, and writes spacers into the DOM. */
  apply(metrics: PageMetrics): void {
    const children = this.blocks();
    // Heights do not depend on the spacers, so the check runs before they are removed.
    const key = this.layoutKey(children, metrics);
    if (key === this.lastKey && this.hasSpacers()) return;
    this.clear();
    if (children.length === 0) return;
    const contentTop = this.sizer.getBoundingClientRect().top + this.contentInset();
    const { indexes, blocks } = layoutBlocks(
      children.map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, height: rect.height, placeholder: el.matches(DOM.previewPusher) };
      }),
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
      children[indexes[index]].before(this.spacer(BREAK_CLASS, height, page));
    });
    // The tail fills the last page and then its bottom margin, since the sheet itself has no bottom padding.
    this.spacer(TAIL_CLASS, plan.tailPadding + metrics.marginPx, page + 1);
    this.lastKey = key;
  }

  /** Removes every spacer this paginator inserted. */
  clear(): void {
    this.lastKey = null;
    this.sizer
      .querySelectorAll(`:scope > .${BREAK_CLASS}, :scope > .${TAIL_CLASS}`)
      .forEach((el) => el.remove());
  }

  /** The sizer's children other than Pagewise's own spacers: the blocks a layout measures. */
  blocks(): HTMLElement[] {
    return Array.from(this.sizer.children).filter(
      (el): el is HTMLElement =>
        el.instanceOf(HTMLElement) && !el.classList.contains(BREAK_CLASS) && !el.classList.contains(TAIL_CLASS)
    );
  }

  private hasSpacers(): boolean {
    return this.sizer.querySelector(`:scope > .${TAIL_CLASS}`) !== null;
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

  /** A spacer appended to the sizer; a break is then moved before its block. */
  private spacer(className: string, height: number, pageNumber: number): HTMLElement {
    const spacer = this.sizer.createDiv({ cls: className, attr: { "data-page": String(pageNumber) } });
    spacer.style.height = `${height}px`;
    return spacer;
  }
}
