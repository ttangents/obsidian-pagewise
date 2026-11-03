import type { Editor, MarkdownView, Menu, TFile } from "obsidian";

/**
 * Pagewise's public toolbar API, version 1: the contract other plugins build on.
 * The Vibes document API.md holds the guide for plugin authors. Version 1 only
 * ever grows by optional additions. A breaking version would be passed as a further
 * argument of the ready event, after version 1 (see apiEvents.ts).
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

/**
 * A small mark on an item's button, added in Pagewise 0.38.0 (an optional
 * version 1 addition): a ring around the icon that fills as work progresses, or
 * a dot that asks for attention.
 */
export interface PagewiseToolbarBadge {
  kind: "progress" | "dot";
  /** For "progress": how much is done, from 0 to 1. Absent while the total is unknown; the ring then turns. */
  value?: number;
  /** Added to the button's accessible name and tooltip, such as "4 of 11 sections done". */
  label?: string;
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
  /** The button's badge on this pane, or null for none. Read with isVisible and isActive; added in 0.38.0. */
  badge?: (context: PagewiseToolbarContext) => PagewiseToolbarBadge | null;
}

/** The API object the ready event carries: frozen, and inert after Pagewise unloads. */
export interface PagewiseApi {
  readonly version: 1;
  /** Adds a toolbar item and returns the function that removes it. Never throws. */
  registerToolbarItem(item: PagewiseToolbarItem): () => void;
  /** Asks every toolbar to re-read isVisible, isActive and badge, after the caller's state changed. */
  refreshToolbar(): void;
}

/** Pagewise triggers this workspace event with its API once the API is usable, and again on every request. */
export const READY_EVENT = "pagewise:ready";

/** Another plugin triggers this workspace event to ask Pagewise to send the ready event again. */
export const REQUEST_EVENT = "pagewise:request";

/** Pagewise triggers this workspace event, with no payload, first thing when it unloads. */
export const UNLOAD_EVENT = "pagewise:unload";

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
  for (const key of ["onClick", "menu", "isActive", "isVisible", "badge"]) {
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
      badge: fn("badge") as PagewiseToolbarItem["badge"],
    },
  };
}

/**
 * A badge as another plugin's callback returned it, checked and copied; null for
 * none or for anything Pagewise cannot draw.
 */
export function normalizeBadge(input: unknown): PagewiseToolbarBadge | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "progress" && raw.kind !== "dot") return null;
  const badge: PagewiseToolbarBadge = { kind: raw.kind };
  if (raw.kind === "progress" && typeof raw.value === "number" && Number.isFinite(raw.value)) {
    badge.value = Math.min(1, Math.max(0, raw.value));
  }
  if (typeof raw.label === "string" && raw.label.trim() !== "") badge.label = raw.label.trim().slice(0, MAX_LABEL);
  return badge;
}
