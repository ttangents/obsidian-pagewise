import { PATTERN_ATTRIBUTE, type BackgroundId } from "./backgrounds";
import { TILES } from "./tiles.generated";

/** The custom properties that carry a pattern's tiles; styles/20-backgrounds.css picks one by theme. */
export const PATTERN_PROPERTIES = { light: "--pagewise-pattern-light", dark: "--pagewise-pattern-dark" } as const;

/**
 * Shows a pattern on an element (a paginated pane or a palette swatch), or none for
 * plain or null: the pattern attribute selects the veil in the stylesheet, and the
 * two custom properties carry the tiles, which live in main.js rather than in
 * styles.css. Calling it again replaces what it set before.
 */
export function showPattern(el: HTMLElement, pattern: BackgroundId | null): void {
  // Plain has no tiles, so it clears like null.
  const tiles = pattern === null ? undefined : TILES[pattern];
  if (!pattern || !tiles) {
    el.removeAttribute(PATTERN_ATTRIBUTE);
    el.style.removeProperty(PATTERN_PROPERTIES.light);
    el.style.removeProperty(PATTERN_PROPERTIES.dark);
    return;
  }
  // The tiles are long strings; a repeat call for the same pattern changes nothing.
  if (el.getAttribute(PATTERN_ATTRIBUTE) === pattern && el.style.getPropertyValue(PATTERN_PROPERTIES.light)) return;
  el.setAttribute(PATTERN_ATTRIBUTE, pattern);
  el.style.setProperty(PATTERN_PROPERTIES.light, `url("${tiles.light}")`);
  el.style.setProperty(PATTERN_PROPERTIES.dark, `url("${tiles.dark}")`);
}
