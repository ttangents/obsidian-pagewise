import type { Editor, MarkdownView, Menu, TFile } from "obsidian";

/**
 * Pagewise's public toolbar API, version 1: the contract other plugins build on.
 * The Vibes document TOOLBAR-API holds the guide for plugin authors. Version 1 only
 * ever grows by optional additions; a breaking change would ship as version 2.
 *
 * This module is pure: the Obsidian imports are types only, so the validation and
 * the registry are unit-tested.
 */

/** The pane a toolbar item acts on, handed to every callback. */
export interface PagewiseToolbarContext {
  view: MarkdownView;
  file: TFile | null;
  editor: Editor;
  /** "source" covers Live Preview and Source mode; "preview" is Reading view. */
  mode: "source" | "preview";
}

/** One button another plugin adds to the toolbar. */
export interface PagewiseToolbarItem {
  /** Unique across plugins; by convention "<plugin-id>:<name>". Registering an id again replaces the item. */
  id: string;
  /** The button's accessible name and tooltip, in sentence case. */
  label: string;
  /** A Lucide icon name Obsidian ships, such as "sparkles". */
  icon: string;
  /** Runs when the button is pressed. Exactly one of onClick and menu. */
  onClick?: (context: PagewiseToolbarContext) => void | Promise<void>;
  /** Fills the menu the button opens. Exactly one of onClick and menu. */
  menu?: (menu: Menu, context: PagewiseToolbarContext) => void;
  /** Makes an onClick button a toggle: true shows it pressed. */
  isActive?: (context: PagewiseToolbarContext) => boolean;
  /** False hides the button on this pane. Defaults to shown. */
  isVisible?: (context: PagewiseToolbarContext) => boolean;
  /** Also show the button in Reading view. Defaults to false. */
  readingView?: boolean;
}

/** What `app.plugins.getPlugin("pagewise").api` holds. */
export interface PagewiseApi {
  readonly version: 1;
  /** Adds a toolbar item and returns the function that removes it. Never throws. */
  registerToolbarItem(item: PagewiseToolbarItem): () => void;
  /** Asks every toolbar to re-read isVisible and isActive, after the caller's state changed. */
  refreshToolbar(): void;
}

/** The workspace event Pagewise triggers with its API on load, and with null on unload. */
export const API_EVENT = "pagewise:api";

const MAX_ID = 200;
const MAX_LABEL = 120;

export type Validation = { item: PagewiseToolbarItem } | { error: string };

/**
 * Checks an item handed in by another plugin and copies the fields Pagewise uses,
 * so a caller that later mutates its object cannot change a registered item.
 */
export function validateToolbarItem(input: unknown): Validation {
  if (typeof input !== "object" || input === null) return { error: "the item must be an object" };
  const raw = input as Record<string, unknown>;
  const text = (key: string, max: number): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null;
  };
  const id = text("id", MAX_ID);
  if (!id) return { error: `"id" must be a non-empty string of at most ${MAX_ID} characters` };
  const label = text("label", MAX_LABEL);
  if (!label) return { error: `"label" must be a non-empty string of at most ${MAX_LABEL} characters` };
  const icon = text("icon", MAX_ID);
  if (!icon) return { error: `"icon" must be a Lucide icon name` };
  const fn = (key: string) => (typeof raw[key] === "function" ? raw[key] : undefined);
  for (const key of ["onClick", "menu", "isActive", "isVisible"]) {
    if (raw[key] !== undefined && !fn(key)) return { error: `"${key}" must be a function` };
  }
  const onClick = fn("onClick") as PagewiseToolbarItem["onClick"];
  const menu = fn("menu") as PagewiseToolbarItem["menu"];
  if (!onClick === !menu) return { error: 'exactly one of "onClick" and "menu" is required' };
  const isActive = fn("isActive") as PagewiseToolbarItem["isActive"];
  if (isActive && menu) return { error: '"isActive" works with "onClick" only' };
  if (raw.readingView !== undefined && typeof raw.readingView !== "boolean") {
    return { error: '"readingView" must be true or false' };
  }
  return {
    item: {
      id,
      label,
      icon,
      onClick,
      menu,
      isActive,
      isVisible: fn("isVisible") as PagewiseToolbarItem["isVisible"],
      readingView: raw.readingView === true,
    },
  };
}
