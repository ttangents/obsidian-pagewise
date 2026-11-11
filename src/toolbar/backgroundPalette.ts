import { PLAIN, type Background } from "../appearance/backgrounds";
import { showPattern } from "../appearance/patternStyle";
import type { PartnerStatus } from "../partners/homeCards";

/** What the palette reads and writes: the one background setting, and what Home Cards offers. */
export interface BackgroundChoice {
  current(): string;
  choose(id: string): void;
  /** The patterns Home Cards lends, and whether it is connected (D29). */
  offered(): { status: PartnerStatus; backgrounds: readonly Background[] };
}

/**
 * The background palette: a panel of swatches under the toolbar's Background
 * button, after Home Cards' picker. A pick applies at once and the panel stays open,
 * so patterns can be compared. The swatches form one radio group: Tab enters and
 * leaves it, and the arrow keys move through it, choosing as they go.
 *
 * Each swatch paints with the same custom properties the canvas uses, so a preview
 * matches the canvas in either theme.
 */
export class BackgroundPalette {
  private panel: HTMLElement | null = null;
  private items: { id: string; button: HTMLElement }[] = [];
  private readonly onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!this.panel || !target) return;
    if (this.panel.contains(target) || this.toggle.contains(target)) return;
    this.close(false);
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.panel) return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly toggle: HTMLElement,
    private readonly choice: BackgroundChoice,
    /** Returns focus on close; the toggle by default. The toolbar sends it to More when Background is in More. */
    private readonly refocus: () => void = () => this.toggle.focus()
  ) {}

  get isOpen(): boolean {
    return this.panel !== null;
  }

  open(): void {
    if (this.panel) return;
    const doc = this.host.ownerDocument;
    const panel = this.host.createDiv({ cls: "pagewise-palette", attr: { role: "dialog", "aria-label": "Background" } });
    const { status, backgrounds } = this.choice.offered();
    if (status === "incompatible") {
      // Home Cards is installed, but this Pagewise cannot read what it offers.
      panel.createEl("p", {
        cls: "pagewise-palette-note",
        text: "This version of Pagewise does not support the installed Home Cards. Update Pagewise to use its backgrounds.",
      });
    } else {
      const grid = panel.createDiv({ cls: "pagewise-swatches", attr: { role: "radiogroup", "aria-label": "Background" } });
      grid.addEventListener("keydown", (event) => this.onArrow(event));
      const choices: { id: string; label: string; background: Background | null }[] = [
        { id: PLAIN, label: "Plain", background: null },
        ...backgrounds.map((background) => ({ id: background.id, label: background.label, background })),
      ];
      this.items = choices.map(({ id, label, background }) => {
        const button = grid.createEl("button", { cls: "pagewise-swatch-item", attr: { type: "button", role: "radio" } });
        const face = button.createDiv({ cls: "pagewise-swatch" });
        showPattern(face, background);
        button.createDiv({ cls: "pagewise-swatch-label", text: label });
        button.addEventListener("click", () => this.pick(id));
        return { id, button };
      });
    }
    this.panel = panel;
    this.paint();
    this.toggle.setAttribute("aria-expanded", "true");
    doc.addEventListener("pointerdown", this.onPointerDown, true);
    doc.addEventListener("keydown", this.onKeyDown, true);
    const selected = this.items.find((item) => item.button.tabIndex === 0)?.button;
    if (selected) selected.focus();
    else {
      // A panel with only a note takes focus itself, so Escape and screen readers reach it.
      panel.tabIndex = -1;
      panel.focus();
    }
  }

  /** Closes the panel; `refocus` returns focus through the refocus callback (the Background button by default). */
  close(refocus: boolean): void {
    if (!this.panel) return;
    const doc = this.host.ownerDocument;
    doc.removeEventListener("pointerdown", this.onPointerDown, true);
    doc.removeEventListener("keydown", this.onKeyDown, true);
    this.panel.remove();
    this.panel = null;
    this.items = [];
    this.toggle.setAttribute("aria-expanded", "false");
    if (refocus) this.refocus();
  }

  /** Moves the selection mark to the stored background, or to Plain when Home Cards does not offer it now. */
  paint(): void {
    const stored = this.choice.current();
    const current = this.items.some((item) => item.id === stored) ? stored : PLAIN;
    this.items.forEach(({ id, button }) => {
      const on = id === current;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  private pick(id: string): void {
    if (id !== this.choice.current()) this.choice.choose(id);
    this.paint();
  }

  /** Arrow keys move through the grid in reading order and choose the swatch reached. */
  private onArrow(event: KeyboardEvent): void {
    const index = this.items.findIndex((item) => item.button === event.target);
    if (index < 0) return;
    const columns = this.columns();
    const step =
      event.key === "ArrowRight" ? 1
      : event.key === "ArrowLeft" ? -1
      : event.key === "ArrowDown" ? columns
      : event.key === "ArrowUp" ? -columns
      : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = this.items[Math.min(this.items.length - 1, Math.max(0, index + step))];
    this.pick(next.id);
    next.button.focus();
  }

  /** Swatches in the first row, read from the layout so the grid may reflow. */
  private columns(): number {
    const top = this.items[0]?.button.offsetTop;
    const count = this.items.filter((item) => item.button.offsetTop === top).length;
    return Math.max(1, count);
  }
}
