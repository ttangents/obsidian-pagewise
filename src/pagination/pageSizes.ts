/** Standard page sizes and the pixel metrics derived from them. */

export type PageSizeId = "a4" | "a5" | "letter" | "legal";

/** One standard page size: its id, display label, and dimensions in millimetres. */
export interface PageSize {
  id: PageSizeId;
  label: string;
  widthMm: number;
  heightMm: number;
}

/** Resolved pixel geometry for one page-size + margin + gap combination. */
export interface PageMetrics {
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  gapPx: number;
  /** Usable height of one page: page height minus both vertical margins. */
  contentHeightPx: number;
}

const PX_PER_INCH = 96;
const PX_PER_MM = PX_PER_INCH / 25.4;

/** The supported page sizes, in display order. */
export const PAGE_SIZES: readonly PageSize[] = [
  { id: "a4", label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
  { id: "a5", label: "A5 (148 × 210 mm)", widthMm: 148, heightMm: 210 },
  { id: "letter", label: "US Letter (8.5 × 11 in)", widthMm: 215.9, heightMm: 279.4 },
  { id: "legal", label: "US Legal (8.5 × 14 in)", widthMm: 215.9, heightMm: 355.6 },
];

/** Looks up a page size by id; unknown ids fall back to the first entry (A4). */
export function pageSizeById(id: string): PageSize {
  return PAGE_SIZES.find((size) => size.id === id) ?? PAGE_SIZES[0];
}

/** Converts a page size and margin (mm) plus gap (px) into pixel metrics at 96 dpi. */
export function resolveMetrics(size: PageSize, marginMm: number, gapPx: number): PageMetrics {
  const marginPx = marginMm * PX_PER_MM;
  const pageHeightPx = size.heightMm * PX_PER_MM;
  return {
    pageWidthPx: size.widthMm * PX_PER_MM,
    pageHeightPx,
    marginPx,
    gapPx,
    contentHeightPx: pageHeightPx - 2 * marginPx,
  };
}
