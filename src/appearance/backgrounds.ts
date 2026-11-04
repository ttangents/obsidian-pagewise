/**
 * The canvas backgrounds. Home Cards owns the patterns and their tiles and lends
 * them to Pagewise through its API (D29); this module checks what Home Cards hands
 * over and turns it into what the stylesheet paints. Pure, so it is unit-tested.
 */

/** The plain canvas: no pattern. Always offered, and the default. */
export const PLAIN = "plain";

/** The attribute that carries the shown pattern's id on a pane and on a swatch. Plain sets none. */
export const PATTERN_ATTRIBUTE = "data-pagewise-pattern";

/** One pattern the palette offers, ready to paint. */
export interface Background {
  id: string;
  label: string;
  /** The tile for light themes and for dark themes, each an image URL. */
  tiles: { light: string; dark: string };
  /** Pagewise's veil for each theme: the share of canvas colour laid over the tile, from 0 to 1. */
  veil: { light: number; dark: number };
}

/**
 * Home Cards calibrates each pattern's veil so every pattern carries about the
 * same weight behind its cards. A page is read for longer than a card is scanned,
 * so Pagewise keeps this share of the ink Home Cards keeps: the pattern stays a
 * texture at the edge of attention.
 */
export const INK_SHARE = 0.6;

/** Pagewise's veil for a pattern Home Cards veils by `homeCardsVeil` (0 to 1). */
export function pagewiseVeil(homeCardsVeil: number): number {
  const veil = 1 - INK_SHARE * (1 - homeCardsVeil);
  return Math.round(veil * 1000) / 1000;
}

const MAX_ID = 200;
const MAX_LABEL = 120;
const MAX_BACKGROUNDS = 200;
/**
 * Image URLs Pagewise will put into a stylesheet value: inline images, and files
 * Obsidian serves from the vault or a plugin folder (`app://`). Quotes, backslashes,
 * parentheses and white space are refused, so a URL can never end the CSS value.
 */
const IMAGE_URL = /^(?:data:image\/(?:webp|png|jpeg|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=]+|app:\/\/[^\s"'()\\]+)$/;

/**
 * Checks the list Home Cards returned and copies the fields Pagewise uses. An entry
 * that is malformed in any way is left out, so one bad pattern costs only itself;
 * a repeated id keeps its first entry; "plain" is Pagewise's own and is skipped.
 */
export function readBackgrounds(raw: unknown): Background[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>([PLAIN]);
  const backgrounds: Background[] = [];
  for (const entry of raw.slice(0, MAX_BACKGROUNDS)) {
    const background = readBackground(entry);
    if (!background || seen.has(background.id)) continue;
    seen.add(background.id);
    backgrounds.push(background);
  }
  return backgrounds;
}

function readBackground(entry: unknown): Background | null {
  if (typeof entry !== "object" || entry === null) return null;
  const raw = entry as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null);
  const url = (value: unknown) => (typeof value === "string" && IMAGE_URL.test(value) ? value : null);
  const share = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null);
  const id = text(raw.id, MAX_ID);
  const label = text(raw.label, MAX_LABEL);
  const light = url(raw.light);
  const dark = url(raw.dark);
  const veil = typeof raw.veil === "object" && raw.veil !== null ? (raw.veil as Record<string, unknown>) : {};
  const veilLight = share(veil.light);
  const veilDark = share(veil.dark);
  if (!id || !label || !light || !dark || veilLight === null || veilDark === null) return null;
  return {
    id,
    label,
    tiles: { light, dark },
    veil: { light: pagewiseVeil(veilLight), dark: pagewiseVeil(veilDark) },
  };
}
