import { BACKGROUND_IDS, type BackgroundId } from "./appearance/backgrounds";
import { PAGE_SIZES, type PageSizeId } from "./pagination/pageSizes";

/**
 * The settings schema: types, defaults, and the loader-side validation. Pure data,
 * no Obsidian imports, so it is unit-testable. The UI lives in settingsTab.ts.
 */

export type ToggleScope = "note" | "global";
export type PropertiesMode = "sidebar" | "collapse" | "none";
export type ToolbarScope = "paginated" | "all";

/** A toolbar button the user added: a command from the command palette and its icon. */
export interface CommandButton {
  commandId: string;
  icon: string;
}

/** Caps that keep a hand-edited data.json from bloating the toolbar or settings. */
export const MAX_COMMAND_BUTTONS = 30;
const MAX_HIDDEN_CONTROLS = 200;
const MAX_ID_LENGTH = 200;

/** Word's default margin on every side: one inch. */
export const WORD_MARGIN_MM = 25.4;

export interface PagewiseSettings {
  /** "note": ephemeral, per focused note. "global": persistent, all notes at once. */
  scope: ToggleScope;
  /** The persisted on/off state used only in global scope. */
  globalEnabled: boolean;
  pageSize: PageSizeId;
  marginMm: number;
  gapPx: number;
  /** What happens to the in-note Properties panel while a pane is paginated. */
  propertiesMode: PropertiesMode;
  /** The canvas around the sheets: plain, or one of the Home Cards patterns. */
  background: BackgroundId;
  /** Which panes carry the toolbar: paginated ones (default) or every Markdown pane. */
  toolbarScope: ToolbarScope;
  /** Ids of toolbar controls the user hid: built-in ones and ones other plugins added. */
  hiddenControls: string[];
  /** Command buttons the user added, in toolbar order. */
  commandButtons: CommandButton[];
}

export const DEFAULT_SETTINGS: PagewiseSettings = {
  scope: "note",
  globalEnabled: false,
  pageSize: "a4",
  marginMm: WORD_MARGIN_MM,
  gapPx: 24,
  propertiesMode: "sidebar",
  background: "plain",
  toolbarScope: "paginated",
  hiddenControls: [],
  commandButtons: [],
};

/**
 * Builds a valid settings object from whatever data.json holds. Unknown keys (left
 * by removed features) are dropped rather than carried forward on every save, and
 * each known key falls back to its default when its stored value is the wrong type
 * or outside the allowed set.
 */
export function normalizeSettings(raw: unknown): PagewiseSettings {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const number = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const d = DEFAULT_SETTINGS;
  return {
    scope: oneOf(data.scope, ["note", "global"], d.scope),
    globalEnabled: typeof data.globalEnabled === "boolean" ? data.globalEnabled : d.globalEnabled,
    pageSize: oneOf(data.pageSize, PAGE_SIZES.map((size) => size.id), d.pageSize),
    marginMm: number(data.marginMm, 0, 100, d.marginMm),
    gapPx: number(data.gapPx, 0, 200, d.gapPx),
    propertiesMode: oneOf(data.propertiesMode, ["sidebar", "collapse", "none"], d.propertiesMode),
    background: oneOf(data.background, BACKGROUND_IDS, d.background),
    toolbarScope: oneOf(data.toolbarScope, ["paginated", "all"], d.toolbarScope),
    hiddenControls: idList(data.hiddenControls),
    commandButtons: commandButtons(data.commandButtons),
  };
}

/** Distinct non-empty ids, in their stored order. */
function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && id !== "" && id.length <= MAX_ID_LENGTH);
  return [...new Set(ids)].slice(0, MAX_HIDDEN_CONTROLS);
}

/** Well-formed command buttons, one per command, in their stored order. */
function commandButtons(value: unknown): CommandButton[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const buttons: CommandButton[] = [];
  for (const entry of value) {
    const raw = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    const { commandId, icon } = raw;
    if (typeof commandId !== "string" || commandId === "" || commandId.length > MAX_ID_LENGTH || seen.has(commandId)) continue;
    if (typeof icon !== "string" || icon === "" || icon.length > MAX_ID_LENGTH) continue;
    seen.add(commandId);
    buttons.push({ commandId, icon });
    if (buttons.length === MAX_COMMAND_BUTTONS) break;
  }
  return buttons;
}
