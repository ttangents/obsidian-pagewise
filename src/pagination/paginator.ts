import { planLayout } from "./layoutEngine";
import type { PageMetrics } from "./pageSizes";

const BREAK_CLASS = "pagewise-break";
const TAIL_CLASS = "pagewise-tail";

/**
 * Applies a layout plan to one preview sizer by inserting spacer elements
 * before blocks that would overflow their page. The stylesheet paints the
 * spacers as the ground between sheets and prints the page number on them.
 */
export class Paginator {
  constructor(private readonly sizer: HTMLElement) {}

  /** Measures the natural layout, computes breaks, and writes spacers into the DOM. */
  apply(metrics: PageMetrics): void {
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
      breakHeight: 2 * metrics.marginPx + metrics.gapPx,
    });
    let page = 0;
    plan.breaksBefore.forEach((height, index) => {
      if (height <= 0) return;
      page += 1;
      blocks[index].before(this.spacer(BREAK_CLASS, height, page));
    });
    this.spacer(TAIL_CLASS, plan.tailPadding, page + 1);
  }

  /** Removes every spacer this paginator inserted. */
  clear(): void {
    this.sizer
      .querySelectorAll(`:scope > .${BREAK_CLASS}, :scope > .${TAIL_CLASS}`)
      .forEach((el) => el.remove());
  }

  private blockElements(): HTMLElement[] {
    return Array.from(this.sizer.children).filter(
      (el): el is HTMLElement =>
        el.instanceOf(HTMLElement) && !el.classList.contains(BREAK_CLASS) && !el.classList.contains(TAIL_CLASS)
    );
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
