/**
 * Semantic Zoom, an optional companion plugin that reads a note at five depths.
 * Pagewise offers its reading depths from the toolbar when Semantic Zoom is
 * installed and ready, and shows nothing otherwise. This module holds the only
 * assumptions Pagewise makes about Semantic Zoom's public API (version 1) and
 * imports nothing from Obsidian at runtime.
 */

/** One reading depth, as Semantic Zoom names it. Level 5 is the shortest, 1 the full note. */
export interface ReadingLevel {
  level: number;
  name: string;
  hint: string;
}

/** What the toolbar needs: the depths on offer and a way to open a note at one. */
export interface ReadingDepth {
  levels: ReadingLevel[];
  /** Opens the note at `level` in `leaf`, near the zero-based source `line`. */
  open(file: unknown, level: number, leaf: unknown, line?: number): Promise<void>;
}

interface PluginWithApi {
  api?: {
    version?: unknown;
    available?: unknown;
    levels?: unknown;
    open?: unknown;
  };
}

function isLevel(value: unknown): value is ReadingLevel {
  const v = value as Partial<ReadingLevel> | null;
  return !!v && typeof v.level === "number" && typeof v.name === "string" && typeof v.hint === "string";
}

/**
 * Reads Semantic Zoom's API from its plugin instance. Returns null unless the API
 * is version 1, reports itself available, lists at least one level, and can open
 * a note, so a newer or half-loaded Semantic Zoom hides the control instead of
 * breaking it.
 */
export function readingDepthFrom(plugin: unknown): ReadingDepth | null {
  const api = (plugin as PluginWithApi | null | undefined)?.api;
  if (!api || api.version !== 1 || api.available !== true || typeof api.open !== "function") return null;
  if (!Array.isArray(api.levels)) return null;
  const levels = api.levels.filter(isLevel);
  if (levels.length === 0) return null;
  const open = api.open as (file: unknown, options: { level: number; leaf: unknown; line?: number }) => Promise<void>;
  return {
    levels,
    open: (file, level, leaf, line) => open.call(api, file, { level, leaf, line }),
  };
}
