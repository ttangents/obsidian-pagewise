/**
 * Places the mention cards in two columns. A card goes to whichever column holds
 * less so far, measured by how much Markdown its passages carry, so the columns end
 * at about the same height without waiting for Obsidian to render the cards. Pure,
 * so the tests can check the balance.
 */

/** A card's rough height: its title plus the Markdown of its passages. */
export function cardWeight(markdown: readonly string[]): number {
  const TITLE = 80;
  const PASSAGE = 40;
  return TITLE + markdown.reduce((sum, passage) => sum + PASSAGE + passage.length, 0);
}

/** Tracks how full each column is, and says where the next card goes. */
export class ColumnBalance {
  private readonly heights: number[];

  constructor(columns: number) {
    this.heights = Array.from({ length: columns }, () => 0);
  }

  /** The column for a card of this weight: the lowest one, the leftmost on a tie. */
  place(weight: number): number {
    let target = 0;
    this.heights.forEach((height, index) => {
      if (height < this.heights[target]) target = index;
    });
    this.heights[target] += weight;
    return target;
  }
}
