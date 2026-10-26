import type { App, MarkdownView, Menu, MenuItem } from "obsidian";

/**
 * Every undocumented Obsidian surface Pagewise touches, in one place. Each accessor
 * is guarded, so an Obsidian update that removes one degrades a feature instead of
 * throwing. When an update breaks something, this file is the list to audit.
 *
 * - app.commands.executeCommandById: run a built-in command (formatting buttons).
 * - app.hotkeyManager.printHotkeyForCommand: the user's binding for a command (menu hints).
 * - Menu.dom / MenuItem.dom: the rendered elements (submenu anchoring, hint placement).
 * - MarkdownView.metadataEditor.setCollapse: collapse Properties in Live Preview.
 * - app.plugins.getPlugin: another installed plugin's instance (the Semantic Zoom integration).
 */

interface AppInternals {
  commands?: { executeCommandById?(id: string): boolean };
  hotkeyManager?: { printHotkeyForCommand?(id: string): string };
  plugins?: { getPlugin?(id: string): unknown };
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

/** Another community plugin's running instance, or undefined when it is not installed and enabled. */
export function getPlugin(app: App, id: string): unknown {
  return (app as unknown as AppInternals).plugins?.getPlugin?.(id) ?? undefined;
}
