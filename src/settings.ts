import { BACKGROUND_IDS, type BackgroundId } from "./appearance/backgrounds";
import { PAGE_SIZES, type PageSizeId } from "./pagination/pageSizes";

/**
 * The settings schema: types, defaults, and the loader-side validation. Pure data,
 * no Obsidian imports, so it is unit-testable. The UI lives in settingsTab.ts.
 */

export type ToggleScope = "note" | "global";
export type PropertiesMode = "sidebar" | "collapse" | "none";
export type ToolbarDirection = "horizontal" | "vertical";

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
  /**
   * Legacy, unused since 0.25.0: the floating toolbar's expansion direction. The
   * document toolbar has one fixed layout. The key stays in the schema so a saved
   * value survives, and an install rolled back to 0.24.x finds it unchanged.
   */
  toolbarDirection: ToolbarDirection;
  /** The canvas around the sheets: plain, or one of the Home Cards patterns. */
  background: BackgroundId;
}

export const DEFAULT_SETTINGS: PagewiseSettings = {
  scope: "note",
  globalEnabled: false,
  pageSize: "a4",
  marginMm: WORD_MARGIN_MM,
  gapPx: 24,
  propertiesMode: "sidebar",
  toolbarDirection: "horizontal",
  background: "plain",
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
    toolbarDirection: oneOf(data.toolbarDirection, ["horizontal", "vertical"], d.toolbarDirection),
    background: oneOf(data.background, BACKGROUND_IDS, d.background),
  };
}
