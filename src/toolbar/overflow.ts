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

/** A button on the bar, the group it sits in, and when it leaves for More. */
export interface FitItem {
  button: HTMLElement;
  group: HTMLElement;
  overflowRank: number;
}

/**
 * Fits the bar's groups into their box. The More button shows only when something
 * moved into it. A section (the box around related groups) with nothing showing is
 * marked empty too, so the stylesheet draws no divider for it.
 */
export function fitToWidth(groupsEl: HTMLElement, items: readonly FitItem[], moreButton: HTMLElement): void {
  const sections = new Set(items.map(({ group }) => group.parentElement).filter((el): el is HTMLElement => el !== null));
  sections.forEach((section) => section.classList.remove(EMPTY_CLASS));
  items.forEach(({ button, group }) => {
    button.classList.remove(OVERFLOWED_CLASS);
    group.classList.remove(EMPTY_CLASS);
  });
  // A group whose controls are all unavailable takes no space at all.
  items.forEach(({ group }) => group.classList.toggle(EMPTY_CLASS, groupIsEmpty(group)));
  const markSections = () => sections.forEach((section) => section.classList.toggle(EMPTY_CLASS, sectionIsEmpty(section)));
  markSections();
  moreButton.classList.add(OVERFLOWED_CLASS);
  const overflowing = () => groupsEl.scrollWidth > groupsEl.clientWidth + 1;
  if (groupsEl.offsetParent === null || !overflowing()) return;
  moreButton.classList.remove(OVERFLOWED_CLASS);
  const leaving = [...items].sort((a, b) => a.overflowRank - b.overflowRank);
  for (const { button, group } of leaving) {
    if (!overflowing()) break;
    // A control already hidden (unavailable, or in a group Reading view hides) frees no space.
    if (button.offsetParent === null) continue;
    button.classList.add(OVERFLOWED_CLASS);
    if (groupIsEmpty(group)) {
      group.classList.add(EMPTY_CLASS);
      markSections();
    }
  }
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
