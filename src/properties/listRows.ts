import { DOM } from "../obsidianDom";

/**
 * Marks the rows of a Pagewise inspector that hold a list with values, such as
 * related notes, aliases or tags, so the stylesheet can put their label above the
 * pills, as Obsidian does in a narrow sidebar. Empty lists and single values stay
 * compact rows. Obsidian redraws a row whenever its value changes, so the inspector
 * marks the rows again after every redraw.
 */

export const LIST_ROW_CLASS = "pagewise-list-property";

/** The property types Obsidian draws as pills. */
const LIST_TYPES = ["multitext", "aliases", "tags"];

/** The parts of a DOM element the marking reads, so the tests can pass plain objects. */
export interface RowLike {
  querySelector(selector: string): { getAttribute(name: string): string | null; querySelector(selector: string): unknown } | null;
  classList: { toggle(token: string, force: boolean): unknown };
}

/** True when the row's value is a list type that shows at least one pill. */
export function isListRow(row: RowLike): boolean {
  const value = row.querySelector(DOM.metadataValue);
  if (!value || !LIST_TYPES.includes(value.getAttribute(DOM.propertyTypeAttribute) ?? "")) return false;
  return value.querySelector(DOM.multiSelectPill) !== null;
}

/** Marks or unmarks every property row under the root. */
export function markListRows(root: { querySelectorAll(selector: string): { forEach(callback: (row: RowLike) => void): void } }): void {
  root.querySelectorAll(DOM.metadataProperty).forEach((row) => row.classList.toggle(LIST_ROW_CLASS, isListRow(row)));
}
