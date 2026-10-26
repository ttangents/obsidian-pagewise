import type { App, MarkdownView, Menu, MenuItem, WorkspaceLeaf } from "obsidian";

/**
 * Every undocumented Obsidian method and field Pagewise touches, in one place; the
 * DOM structure and view types it relies on are listed in obsidianDom.ts. Each accessor
 * is guarded, so an Obsidian update that removes one degrades a feature instead of
 * throwing. When an update breaks something, these two files are the list to audit.
 *
 * - app.commands.executeCommandById: run a built-in command (formatting buttons).
 * - app.hotkeyManager.printHotkeyForCommand: the user's binding for a command (menu hints).
 * - Menu.dom / MenuItem.dom: the rendered elements (submenu anchoring, hint placement).
 * - MarkdownView.metadataEditor.setCollapse: collapse Properties in Live Preview.
 * - app.commands.listCommands / findCommand: the command palette's commands (command buttons).
 * - app.setting.open / openTabById: open Pagewise's settings ("Customize toolbar…").
 * - Menu.items: whether a filled menu has anything to show.
 * - WorkspaceLeaf.history.backHistory / forwardHistory: whether Back and Forward can move.
 */

/** A command as the command palette lists it. */
export interface PaletteCommand {
  id: string;
  name: string;
  icon?: string;
}

interface AppInternals {
  commands?: {
    executeCommandById?(id: string): boolean;
    listCommands?(): PaletteCommand[];
    findCommand?(id: string): PaletteCommand | undefined;
  };
  setting?: { open?(): void; openTabById?(id: string): unknown };
  hotkeyManager?: { printHotkeyForCommand?(id: string): string };
}

interface WithDom {
  dom?: HTMLElement;
}

interface ViewInternals {
  metadataEditor?: { setCollapse?(collapsed: boolean, animate: boolean): void };
}

/** Runs a built-in Obsidian command by id. */
export function executeCommand(app: App, id: string): void {
  (app as unknown as AppInternals).commands?.executeCommandById?.(id);
}

/** The user's hotkey for a command, formatted by Obsidian ("⌘B"), or "" when unbound. */
export function hotkeyFor(app: App, id: string): string {
  return (app as unknown as AppInternals).hotkeyManager?.printHotkeyForCommand?.(id) ?? "";
}

export function menuDom(menu: Menu): HTMLElement | undefined {
  return (menu as unknown as WithDom).dom;
}

export function menuItemDom(item: MenuItem): HTMLElement | undefined {
  return (item as unknown as WithDom).dom;
}

/**
 * Collapses or expands Properties through Live Preview's metadata editor.
 * @returns false when the editor or method is unavailable, so the caller can fall back.
 */
export function setMetadataCollapsed(view: MarkdownView, collapsed: boolean): boolean {
  const editor = (view as unknown as ViewInternals).metadataEditor;
  if (typeof editor?.setCollapse !== "function") return false;
  editor.setCollapse(collapsed, false);
  return true;
}

/** Every command in the command palette, or an empty list when Obsidian hides them. */
export function listCommands(app: App): PaletteCommand[] {
  const commands = (app as unknown as AppInternals).commands?.listCommands?.();
  return Array.isArray(commands) ? commands.filter(isCommand) : [];
}

/** One command by id, or null when no enabled plugin provides it. */
export function findCommand(app: App, id: string): PaletteCommand | null {
  const command = (app as unknown as AppInternals).commands?.findCommand?.(id);
  return isCommand(command) ? command : null;
}

/** Opens Obsidian's settings at a plugin's tab. @returns false when that is unavailable. */
export function openSettingTab(app: App, pluginId: string): boolean {
  const setting = (app as unknown as AppInternals).setting;
  if (typeof setting?.open !== "function" || typeof setting.openTabById !== "function") return false;
  setting.open();
  setting.openTabById(pluginId);
  return true;
}

/**
 * How far a pane can move back and forward through its history, as Obsidian's own
 * tab title bar reads it. Null when Obsidian hides the history, so the toolbar's
 * Back and Forward stay enabled and Obsidian's command decides.
 */
export function navigationDepth(leaf: WorkspaceLeaf): { back: number; forward: number } | null {
  const history = (leaf as unknown as { history?: { backHistory?: unknown; forwardHistory?: unknown } }).history;
  if (!Array.isArray(history?.backHistory) || !Array.isArray(history.forwardHistory)) return null;
  return { back: history.backHistory.length, forward: history.forwardHistory.length };
}

/** True when a filled menu has no items; false when it has some or Obsidian hides the list. */
export function menuIsEmpty(menu: Menu): boolean {
  const items = (menu as unknown as { items?: unknown }).items;
  return Array.isArray(items) && items.length === 0;
}

function isCommand(value: unknown): value is PaletteCommand {
  const command = value as Partial<PaletteCommand> | null | undefined;
  return !!command && typeof command.id === "string" && typeof command.name === "string";
}
