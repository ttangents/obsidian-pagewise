import { addIcon, getIcon, removeIcon } from "obsidian";

/**
 * Icon resolution for the toolbar and its menus. Lucide renames icons over time and
 * Obsidian ships whichever Lucide release it was built with, so every icon is named
 * as a newest-first candidate list and resolved against the running bundle.
 */

/** Icon candidates, newest Lucide name first. */
export type IconChoice = readonly string[];

const HEADING_ICON_PREFIX = "pagewise-heading-";
export const SEPARATOR_ICON = "pagewise-separator";

/** The Bear-style boxed numeral registered for a heading level. */
export function headingIcon(level: number): string {
  return `${HEADING_ICON_PREFIX}${level}`;
}

/**
 * Registers the icons Lucide has no equivalent for: boxed heading numerals and the dot-line separator.
 * @returns a function that removes every icon it registered, for unload
 */
export function registerCustomIcons(levels: readonly number[]): () => void {
  levels.forEach((level) => {
    addIcon(
      headingIcon(level),
      `<rect x="14" y="14" width="72" height="72" rx="16" fill="none" stroke="currentColor" stroke-width="7"/><text x="50" y="68" text-anchor="middle" font-size="48" font-weight="600" fill="currentColor">${level}</text>`
    );
  });
  addIcon(
    SEPARATOR_ICON,
    '<circle cx="16" cy="50" r="9" fill="currentColor"/><line x1="34" y1="50" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'
  );
  return () => [...levels.map(headingIcon), SEPARATOR_ICON].forEach((id) => removeIcon(id));
}

/** The first candidate the running Lucide bundle has; the last candidate when none match. */
export function resolveIcon(icons: IconChoice): string {
  return icons.find((name) => getIcon(name)) ?? icons[icons.length - 1];
}
