/**
 * Pure pagination math. No DOM access: the paginator measures, this module plans.
 */

/** One block's natural position in the un-paginated flow, relative to the content origin. */
export interface BlockGeometry {
  top: number;
  height: number;
}

/** What planLayout needs: the blocks' geometry plus one page's usable height and a break's cost. */
export interface LayoutInput {
  blocks: BlockGeometry[];
  /** Usable height of one page: page height minus both vertical margins. */
  contentHeight: number;
  /** Extra height a page break consumes: bottom margin + gap + top margin. */
  breakHeight: number;
}

/** planLayout's answer: how much spacer to insert before each block, and the padding after the last. */
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
 * starts a page (canBreak), so oversized blocks degrade gracefully: it runs on
 * across page boundaries with no gap, and the block after it is placed on the
 * page where the oversized block ends, so no spacer is ever negative.
 */
export function planLayout({ blocks, contentHeight, breakHeight }: LayoutInput): LayoutPlan {
  const breaksBefore = new Array<number>(blocks.length).fill(0);
  let shift = 0;
  let pageStart = 0;
  let lastBottom = 0;
  blocks.forEach((block, index) => {
    const top = block.top + shift;
    // After an oversized block the flow has run past the page end with no break;
    // count the pages it filled, so the offset is measured on the page it ends on.
    if (top - pageStart >= contentHeight && contentHeight > 0) {
      pageStart += Math.floor((top - pageStart) / contentHeight) * contentHeight;
    }
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

/** One direct child of the preview sizer as the paginator measured it. */
export interface MeasuredChild {
  top: number;
  height: number;
  /** Reading view's placeholder for sections it has not rendered (`.markdown-preview-pusher`). */
  placeholder: boolean;
}

/**
 * Picks the children a layout plan covers. Placeholders and children with no
 * height take no part: a page break before them would mean nothing. Reading view
 * renders a long note lazily and stands a placeholder in for the sections above
 * the rendered window, so positions are measured from the bottom of a leading
 * placeholder: the rendered window is laid out as if it started a page.
 *
 * @returns the indexes of the chosen children, and their geometry relative to the origin
 */
export function layoutBlocks(children: readonly MeasuredChild[], contentTop: number): { indexes: number[]; blocks: BlockGeometry[] } {
  let origin = contentTop;
  const indexes: number[] = [];
  const blocks: BlockGeometry[] = [];
  children.forEach((child, index) => {
    if (child.placeholder) {
      if (indexes.length === 0) origin = Math.max(origin, child.top + child.height);
      return;
    }
    if (child.height <= 0) return;
    indexes.push(index);
    blocks.push({ top: child.top - origin, height: child.height });
  });
  return { indexes, blocks };
}
