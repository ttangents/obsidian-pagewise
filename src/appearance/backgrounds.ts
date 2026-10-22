/**
 * The canvas backgrounds: the registry the settings, the toolbar's palette and the
 * stylesheet share. Pure data, so it is unit-tested. The patterns and their tiles
 * come from Home Cards; styles/20-backgrounds.css paints them, and the build turns
 * each tile into an inline image, because Obsidian loads styles.css with no asset path.
 */

export const BACKGROUNDS = [
  { id: "plain", label: "Plain" },
  { id: "diamonds", label: "Diamonds" },
  { id: "leaves", label: "Leaves" },
  { id: "stitches", label: "Stitches" },
  { id: "suns", label: "Suns" },
  { id: "grid", label: "Grid" },
  { id: "rain", label: "Rain" },
  { id: "squares", label: "Squares" },
  { id: "polka", label: "Polka" },
  { id: "basket", label: "Basket" },
  { id: "pebbles", label: "Pebbles" },
  { id: "confetti", label: "Confetti" },
  { id: "petals", label: "Petals" },
  { id: "paws", label: "Paws" },
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export const BACKGROUND_IDS: readonly BackgroundId[] = BACKGROUNDS.map((background) => background.id);

/** The attribute that carries the chosen pattern on a pane and on a swatch. Plain sets none. */
export const PATTERN_ATTRIBUTE = "data-pagewise-pattern";
