import type { Editor, Menu } from "obsidian";
import { menuItemDom } from "../obsidianInternals";
import { availableHighlights } from "./controls";
import { SEPARATOR_ICON, headingIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS, insertCallout, insertSeparator, setHeading } from "./markdownActions";
import { addEntry, addHotkeyHint, addSubmenu, type CommandRunner } from "./menus";

/** Contents of the Headings, Lists-and-blocks and Highlight menus. */

interface CommandEntry {
  title: string;
  icon: IconChoice;
  commandId: string;
}

/** Bear's list menu, mapped to Obsidian's own commands so the user's bindings apply. */
const BLOCK_COMMANDS: readonly CommandEntry[] = [
  { title: "List", icon: ["list"], commandId: "editor:toggle-bullet-list" },
  { title: "Ordered list", icon: ["list-ordered"], commandId: "editor:toggle-numbered-list" },
  { title: "Block quote", icon: ["message-square-quote", "quote"], commandId: "editor:toggle-blockquote" },
  { title: "Todo", icon: ["check-square", "square-check"], commandId: "editor:toggle-checklist-status" },
];

/** Bear's five callout types, written as Obsidian callout ids. */
const CALLOUT_TYPES: readonly { id: string; title: string; icon: IconChoice }[] = [
  { id: "note", title: "Note", icon: ["pencil"] },
  { id: "tip", title: "Tip", icon: ["flame"] },
  { id: "important", title: "Important", icon: ["alert-circle", "circle-alert"] },
  { id: "warning", title: "Warning", icon: ["alert-triangle", "triangle-alert"] },
  { id: "caution", title: "Caution", icon: ["alert-octagon", "octagon-alert"] },
];

const CALLOUT_ICON: IconChoice = ["list-indent-increase", "indent"];

export function fillHeadingMenu(menu: Menu, editor: Editor): void {
  HEADING_LEVELS.forEach((level) =>
    addEntry(menu, { title: `Heading ${level}`, icon: [headingIcon(level)], action: () => setHeading(editor, level) })
  );
}

export function fillBlocksMenu(menu: Menu, commands: CommandRunner, editor: Editor): void {
  BLOCK_COMMANDS.forEach(({ title, icon, commandId }) => {
    const item = addEntry(menu, { title, icon, action: () => commands.runCommand(commandId) });
    addHotkeyHint(commands, item, commandId);
  });
  const calloutEntries = (inline: boolean) =>
    CALLOUT_TYPES.map(({ id, title, icon }) => ({ title, icon, action: () => insertCallout(editor, id, inline) }));
  addSubmenu(menu, "Callout", CALLOUT_ICON, calloutEntries(false));
  addSubmenu(menu, "Callout (inline)", CALLOUT_ICON, calloutEntries(true));
  menu.addSeparator();
  addEntry(menu, { title: "Separator", icon: [SEPARATOR_ICON], action: () => insertSeparator(editor) });
}

const HIGHLIGHT_ICON: IconChoice = ["highlighter", "paintbrush"];

/**
 * Plain highlight, then each colour Obsidian offers (1.14 and later), each running
 * Obsidian's own command so the user's hotkeys apply. A colour's icon takes the
 * theme's matching colour from the stylesheet.
 */
export function fillHighlightMenu(menu: Menu, commands: CommandRunner): void {
  availableHighlights((id) => commands.hasCommand(id)).forEach(({ id, title, commandId }, index) => {
    if (index === 1) menu.addSeparator();
    const item = addEntry(menu, { title, icon: HIGHLIGHT_ICON, action: () => commands.runCommand(commandId) });
    menuItemDom(item)?.classList.add(`pagewise-highlight-${id}`);
    addHotkeyHint(commands, item, commandId);
  });
}
