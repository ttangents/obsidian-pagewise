/**
 * Moves toolbar buttons into the More menu until the rest fit on one line. Starts
 * from everything shown each time, so the result depends only on the available
 * width. Buttons leave in rank order (lowest first) and return in reverse, so a
 * button is always either in its usual place or in More, never reshuffled.
 */

export const OVERFLOWED_CLASS = "is-overflowed";
export const EMPTY_CLASS = "is-empty";
export const UNAVAILABLE_CLASS = "is-unavailable";
export const DISABLED_CLASS = "is-disabled";

/** How far a box may pass its edge, in CSS pixels, before it counts as cut off: sub-pixel rounding only. */
const TOLERANCE = 0.5;

/**
 * A button on the bar, the group it sits in, and when it leaves for More. The
 * trailing controls (Background, Properties) sit in no group: they belong to the
 * bar's fixed end, which has no divider to tidy.
 */
export interface FitItem {
  button: HTMLElement;
  group: HTMLElement | null;
  overflowRank: number;
}

/** The boxes the fit measures: the bar, the flexible box of groups, and the trailing cluster. */
export interface FitBoxes {
  bar: HTMLElement;
  groups: HTMLElement;
  trailing: HTMLElement;
  more: HTMLElement;
}

/**
 * Fits the bar into its width. The More button shows only when something moved
 * into it. A section (the box around related groups) with nothing showing is
 * marked empty too, so the stylesheet draws no divider for it.
 */
export function fitToWidth(boxes: FitBoxes, items: readonly FitItem[]): void {
  const { groups, more } = boxes;
  const grouped = items.filter((item): item is FitItem & { group: HTMLElement } => item.group !== null);
  const sections = new Set(grouped.map(({ group }) => group.parentElement).filter((el): el is HTMLElement => el !== null));
  sections.forEach((section) => section.classList.remove(EMPTY_CLASS));
  items.forEach(({ button }) => button.classList.remove(OVERFLOWED_CLASS));
  grouped.forEach(({ group }) => group.classList.remove(EMPTY_CLASS));
  // A group whose controls are all unavailable takes no space at all.
  grouped.forEach(({ group }) => group.classList.toggle(EMPTY_CLASS, groupIsEmpty(group)));
  const markSections = () => sections.forEach((section) => section.classList.toggle(EMPTY_CLASS, sectionIsEmpty(section)));
  markSections();
  more.classList.add(OVERFLOWED_CLASS);
  if (groups.offsetParent === null || !overflowing(boxes)) return;
  more.classList.remove(OVERFLOWED_CLASS);
  const leaving = [...items].sort((a, b) => a.overflowRank - b.overflowRank);
  for (const { button, group } of leaving) {
    if (!overflowing(boxes)) break;
    // A control already hidden (unavailable, or in a group Reading view hides) frees no space.
    if (button.offsetParent === null) continue;
    button.classList.add(OVERFLOWED_CLASS);
    if (group && groupIsEmpty(group)) {
      group.classList.add(EMPTY_CLASS);
      markSections();
    }
  }
}

/**
 * True while any showing button is cut off: the last one in the groups box passes
 * that box's edge, or the trailing cluster passes the bar's content edge. Measured
 * from the boxes themselves, so a button is never left a pixel short.
 */
function overflowing({ bar, groups, trailing }: FitBoxes): boolean {
  const shown = Array.from(groups.querySelectorAll<HTMLElement>("button")).filter((button) => button.offsetParent !== null);
  const last = shown[shown.length - 1];
  if (last && last.getBoundingClientRect().right > groups.getBoundingClientRect().right + TOLERANCE) return true;
  const barBox = bar.getBoundingClientRect();
  const contentRight = barBox.right - parseFloat(bar.ownerDocument.defaultView?.getComputedStyle(bar).paddingRight ?? "0");
  return trailing.getBoundingClientRect().right > contentRight + TOLERANCE;
}

/** True when none of a section's groups shows: each is empty or hidden in this view mode. */
function sectionIsEmpty(section: HTMLElement): boolean {
  return Array.from(section.children).every(
    (group) => group.classList.contains(EMPTY_CLASS) || (group as HTMLElement).offsetParent === null
  );
}

/** True when none of a group's controls currently shows: all unavailable or in More. */
function groupIsEmpty(group: HTMLElement): boolean {
  return Array.from(group.children).every(
    (child) => child.classList.contains(OVERFLOWED_CLASS) || child.classList.contains(UNAVAILABLE_CLASS)
  );
}
