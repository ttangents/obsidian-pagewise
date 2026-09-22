/**
 * Pure pagination math. No DOM access: the paginator measures, this module plans.
 */

/** One block's natural position in the un-paginated flow, relative to the content origin. */
export interface BlockGeometry {
  top: number;
  height: number;
}

export interface LayoutInput {
  blocks: BlockGeometry[];
  /** Usable height of one page: page height minus both vertical margins. */
  contentHeight: number;
  /** Extra height a page break consumes: bottom margin + gap + top margin. */
  breakHeight: number;
}

export interface LayoutPlan {
  /** Spacer height to insert before each block; 0 means no break there. */
  breaksBefore: number[];
  /** Padding after the last block so the final sheet reaches full page height. */
  tailPadding: number;
}

/**
 * Computes where page breaks fall. Walks blocks in order, tracking the running
 * shift that earlier spacers introduce; a block that would overflow the current
 * page gets a spacer that fills the rest of the page plus the inter-page break.
 * A block taller than a full page never breaks before itself when it already
 * starts a page (canBreak), so oversized blocks degrade gracefully.
 */
export function planLayout({ blocks, contentHeight, breakHeight }: LayoutInput): LayoutPlan {
  const breaksBefore = new Array<number>(blocks.length).fill(0);
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
  const tailPadding =
    usedOnLastPage > 0
      ? Math.max(0, contentHeight - (usedOnLastPage % contentHeight || contentHeight))
      : contentHeight;
  return { breaksBefore, tailPadding };
}
