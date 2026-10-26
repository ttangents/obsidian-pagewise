import type { IconChoice } from "./icons";

/**
 * The toolbar's built-in controls, each defined once: its id (the key the user's
 * hidden-controls setting uses), label, icon, place, and what it does. The toolbar
 * builds its buttons from this list and the settings tab lists the same entries,
 * so a rename cannot drift between the two. Pure data, so it is unit-tested.
 */

/** The menus the editing controls open; the toolbar supplies their contents. */
export type ControlMenu = "headings" | "blocks" | "table";

/** A control in the editing groups, which Reading view hides because they need an editor. */
export interface EditingControl {
  id: string;
  label: string;
  icon: IconChoice;
  /** The editing group it sits in, left to right. */
  group: number;
  /** When controls move into More as the pane narrows: lowest leaves first. */
  overflowRank: number;
  /** The Obsidian command the button runs. Exactly one of command and menu. */
  command?: string;
  /** The menu the button opens. Exactly one of command and menu. */
  menu?: ControlMenu;
}

/** A control at the trailing end of the bar, which never moves into More. */
export interface TrailingControl {
  id: "background" | "properties";
  label: string;
  icon: IconChoice;
}

export const EDITING_CONTROLS: readonly EditingControl[] = [
  { id: "headings", label: "Headings", icon: ["heading"], group: 0, overflowRank: 6, menu: "headings" },
  { id: "lists", label: "Lists and blocks", icon: ["list"], group: 0, overflowRank: 5, menu: "blocks" },
  { id: "bold", label: "Bold", icon: ["bold"], group: 1, overflowRank: 8, command: "editor:toggle-bold" },
  { id: "italic", label: "Italic", icon: ["italic"], group: 1, overflowRank: 7, command: "editor:toggle-italics" },
  { id: "highlight", label: "Highlight", icon: ["highlighter", "paintbrush"], group: 1, overflowRank: 4, command: "editor:toggle-highlight" },
  { id: "link", label: "Insert link", icon: ["link-2", "link"], group: 2, overflowRank: 3, command: "editor:insert-link" },
  { id: "table", label: "Table", icon: ["table", "grid-3x3"], group: 2, overflowRank: 2, menu: "table" },
  { id: "image", label: "Insert image", icon: ["image-plus", "image"], group: 2, overflowRank: 1, command: "editor:attach-file" },
];

/** The trailing controls, in bar order after More. */
export const TRAILING_CONTROLS: readonly TrailingControl[] = [
  { id: "background", label: "Background", icon: ["swatch-book", "palette"] },
  { id: "properties", label: "Properties", icon: ["info"] },
];

/** Every built-in control the user can hide, in toolbar order, for the settings tab. */
export const BUILT_IN_CONTROLS: readonly { id: string; label: string }[] = [...EDITING_CONTROLS, ...TRAILING_CONTROLS].map(
  ({ id, label }) => ({ id, label })
);

/** The editing controls grouped as the bar shows them. */
export function editingGroups(): EditingControl[][] {
  const groups: EditingControl[][] = [];
  EDITING_CONTROLS.forEach((control) => (groups[control.group] ??= []).push(control));
  return groups;
}
