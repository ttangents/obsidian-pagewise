import { PATTERN_ATTRIBUTE, type Background } from "./backgrounds";

/**
 * The custom properties that carry a pattern's tiles and veils;
 * styles/20-backgrounds.css picks one of each pair by theme.
 */
export const PATTERN_PROPERTIES = {
  tileLight: "--pagewise-pattern-light",
  tileDark: "--pagewise-pattern-dark",
  veilLight: "--pagewise-veil-light",
  veilDark: "--pagewise-veil-dark",
} as const;

/**
 * Shows a pattern on an element (a paginated pane or a palette swatch), or the
 * plain canvas for null. The attribute marks the element for the stylesheet, and
 * the custom properties carry the tiles and veils Home Cards lent. Calling it again
 * replaces what it set before.
 */
export function showPattern(el: HTMLElement, background: Background | null): void {
  if (!background) {
    el.removeAttribute(PATTERN_ATTRIBUTE);
    Object.values(PATTERN_PROPERTIES).forEach((name) => el.style.removeProperty(name));
    return;
  }
  // Tiles can be long strings; a repeat call for the same pattern changes nothing.
  const tileLight = `url("${background.tiles.light}")`;
  if (el.getAttribute(PATTERN_ATTRIBUTE) === background.id && el.style.getPropertyValue(PATTERN_PROPERTIES.tileLight) === tileLight) return;
  el.setAttribute(PATTERN_ATTRIBUTE, background.id);
  el.style.setProperty(PATTERN_PROPERTIES.tileLight, tileLight);
  el.style.setProperty(PATTERN_PROPERTIES.tileDark, `url("${background.tiles.dark}")`);
  el.style.setProperty(PATTERN_PROPERTIES.veilLight, percent(background.veil.light));
  el.style.setProperty(PATTERN_PROPERTIES.veilDark, percent(background.veil.dark));
}

/** A share from 0 to 1 as a CSS percentage with one decimal. */
function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
