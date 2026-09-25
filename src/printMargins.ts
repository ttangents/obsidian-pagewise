/**
 * Sets the page margins of printed and exported PDFs through a CSS @page rule.
 * Chromium applies @page margins when the export dialog's Margin option is left at
 * "Default"; choosing another margin in the dialog overrides them. The rule only
 * sets margins; paper size stays with the export dialog.
 */
const STYLE_ID = "pagewise-print-margins";

export class PrintMargins {
  /** Applies the given margin in millimetres to every side, or removes the rule when null. */
  apply(marginMm: number | null): void {
    if (marginMm === null) {
      this.dispose();
      return;
    }
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.append(style);
    }
    style.textContent = pageRule(marginMm);
  }

  dispose(): void {
    document.getElementById(STYLE_ID)?.remove();
  }
}

/** The @page rule for a uniform margin; exported for tests. */
export function pageRule(marginMm: number): string {
  return `@page { margin: ${marginMm}mm; }`;
}
