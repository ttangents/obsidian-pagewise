import type { IconChoice } from "./icons";

/**
 * The toolbar's built-in controls, each defined once: its id (the key the user's
 * hidden-controls setting uses), label, icon, place, and what it does. The toolbar
 * builds its buttons from this list and the settings tab lists the same entries,
 * so a rename cannot drift between the two. Pure data, so it is unit-tested.
 */

/** The menus the editing controls open; the toolbar supplies their contents. */
export type ControlMenu = "headings" | "blocks" | "table" | "highlight";

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

/**
 * Back or forward through the pane's history, the first controls on the bar. They
 * run Obsidian's own navigation commands and show in every view mode; while they
 * show, the stylesheet hides the same buttons in Obsidian's tab title bar (D24).
 */
export interface NavigationControl {
  id: "back" | "forward";
  label: string;
  icon: IconChoice;
  /** The Obsidian command the button runs. */
  command: "app:go-back" | "app:go-forward";
  /** Navigation leaves for More last. */
  overflowRank: number;
}

/** A control at the trailing end of the bar, after More. */
export interface TrailingControl {
  id: "background" | "properties";
  label: string;
  icon: IconChoice;
  /** When the control moves into More as the pane narrows: lowest leaves first. */
  overflowRank: number;
  /** When the control shows beyond the user's choice, for the settings tab. */
  note?: string;
}

/**
 * The overflow policy in one place (proposed, REVIEW-2026-11-12 R3). As a pane
 * narrows, controls leave for More in this order, lowest first:
 * Background (rarely changed, and shared by every pane); then Insert image, Table
 * and Highlight; then everything the user or other plugins added, right to left;
 * then Insert link, Lists and blocks, Headings, Italic and Bold; then Forward and
 * Back; and Properties last, only at the narrowest widths. More itself never leaves
 * while it holds anything.
 */
export const OVERFLOW_RANK = {
  background: 10,
  image: 20,
  table: 21,
  highlight: 22,
  /** Added controls take ranks from here up to (not including) ADDED_END, rightmost lowest. */
  added: 30,
  addedEnd: 31,
  link: 40,
  lists: 41,
  headings: 42,
  italic: 43,
  bold: 44,
  forward: 50,
  back: 51,
  properties: 60,
} as const;

/** The rank of the added control at `index` of `count`, left to right: the rightmost leaves first. */
export function addedRank(index: number, count: number): number {
  return OVERFLOW_RANK.added + (count - 1 - index) / Math.max(count, 1);
}

export const NAVIGATION_CONTROLS: readonly NavigationControl[] = [
  { id: "back", label: "Back", icon: ["arrow-left"], command: "app:go-back", overflowRank: OVERFLOW_RANK.back },
  { id: "forward", label: "Forward", icon: ["arrow-right"], command: "app:go-forward", overflowRank: OVERFLOW_RANK.forward },
];

export const EDITING_CONTROLS: readonly EditingControl[] = [
  { id: "headings", label: "Headings", icon: ["heading"], group: 0, overflowRank: OVERFLOW_RANK.headings, menu: "headings" },
  { id: "lists", label: "Lists and blocks", icon: ["list"], group: 0, overflowRank: OVERFLOW_RANK.lists, menu: "blocks" },
  { id: "bold", label: "Bold", icon: ["bold"], group: 1, overflowRank: OVERFLOW_RANK.bold, command: "editor:toggle-bold" },
  { id: "italic", label: "Italic", icon: ["italic"], group: 1, overflowRank: OVERFLOW_RANK.italic, command: "editor:toggle-italics" },
  { id: "highlight", label: "Highlight", icon: ["highlighter", "paintbrush"], group: 1, overflowRank: OVERFLOW_RANK.highlight, menu: "highlight" },
  { id: "link", label: "Insert link", icon: ["link-2", "link"], group: 2, overflowRank: OVERFLOW_RANK.link, command: "editor:insert-link" },
  { id: "table", label: "Table", icon: ["table", "grid-3x3"], group: 2, overflowRank: OVERFLOW_RANK.table, menu: "table" },
  { id: "image", label: "Insert image", icon: ["image-plus", "image"], group: 2, overflowRank: OVERFLOW_RANK.image, command: "editor:attach-file" },
];

/** The trailing controls, in bar order after More. */
export const TRAILING_CONTROLS: readonly TrailingControl[] = [
  {
    id: "background",
    label: "Background",
    icon: ["swatch-book", "palette"],
    overflowRank: OVERFLOW_RANK.background,
    note: "Shows on paginated notes while Home Cards is installed, which lends the patterns.",
  },
  { id: "properties", label: "Properties", icon: ["info"], overflowRank: OVERFLOW_RANK.properties },
];

/** Every built-in control the user can hide, in toolbar order, for the settings tab. */
export const BUILT_IN_CONTROLS: readonly { id: string; label: string; note?: string }[] = [
  ...NAVIGATION_CONTROLS,
  ...EDITING_CONTROLS,
  ...TRAILING_CONTROLS,
].map(({ id, label, ...rest }) => ({ id, label, note: "note" in rest ? rest.note : undefined }));

/** One entry of the Highlight menu: plain highlight or one of Obsidian's colours, each its own command. */
export interface HighlightChoice {
  /** "plain", or the colour as Obsidian's command id names it. */
  id: string;
  title: string;
  commandId: string;
}

/** The Highlight menu, in Obsidian's order. The coloured commands arrived in Obsidian 1.14. */
export const HIGHLIGHT_CHOICES: readonly HighlightChoice[] = [
  { id: "plain", title: "Highlight", commandId: "editor:toggle-highlight" },
  ...(["red", "orange", "yellow", "green", "blue", "purple"] as const).map((colour) => ({
    id: colour,
    title: `${colour[0].toUpperCase()}${colour.slice(1)} highlight`,
    commandId: `editor:toggle-highlight-${colour}`,
  })),
];

/** The Highlight menu's entries this Obsidian can run: plain highlight always, each colour when its command exists. */
export function availableHighlights(hasCommand: (commandId: string) => boolean): HighlightChoice[] {
  return HIGHLIGHT_CHOICES.filter((choice) => choice.id === "plain" || hasCommand(choice.commandId));
}

/**
 * What an editing control does in this Obsidian. Highlight opens its colour menu, and
 * runs plain highlight in one click where Obsidian has no colours (before 1.14).
 */
export function resolveControl(control: EditingControl, hasCommand: (commandId: string) => boolean): Pick<EditingControl, "command" | "menu"> {
  if (control.menu === "highlight" && availableHighlights(hasCommand).length < 2) return { command: HIGHLIGHT_CHOICES[0].commandId };
  return { command: control.command, menu: control.menu };
}

/** The editing controls grouped as the bar shows them. */
export function editingGroups(): EditingControl[][] {
  const groups: EditingControl[][] = [];
  EDITING_CONTROLS.forEach((control) => (groups[control.group] ??= []).push(control));
  return groups;
}
