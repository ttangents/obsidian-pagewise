/**
 * Detects print and PDF export and brackets it with suspend/resume callbacks.
 *
 * Obsidian's exporter renders the note into a temporary `.print` container on
 * <body> and hands the window to Chromium's print pipeline. Layout passes,
 * resize observers, and animation frames running against that state can crash
 * the renderer outright, so the plugin must go completely quiet for the
 * duration.
 *
 * No single signal is reliable across Electron versions, so three are watched:
 * the `beforeprint`/`afterprint` events, the `print` media query, and the
 * `.print` container itself appearing on <body>. Engage and release are
 * idempotent, and release re-checks the live signals first, so overlapping,
 * repeated, or missing events cannot wedge the guard in either state.
 */
export interface PrintGuardHooks {
  suspend(): void;
  resume(): void;
}

export class PrintGuard {
  private engaged = false;
  private readonly media = window.matchMedia("print");

  constructor(private readonly hooks: PrintGuardHooks) {}

  /** True while any live print signal is present, whether or not events fired. */
  isPrinting(): boolean {
    return this.engaged || this.media.matches || hasPrintContainer();
  }

  /**
   * Wires up the three signals. Each teardown is handed to `register`, so the
   * caller (the plugin) can bind their lifetime to its own unload.
   */
  install(register: (teardown: () => void) => void): void {
    const engage = () => this.engage();
    const release = () => this.release();

    window.addEventListener("beforeprint", engage);
    window.addEventListener("afterprint", release);
    register(() => window.removeEventListener("beforeprint", engage));
    register(() => window.removeEventListener("afterprint", release));

    const onMediaChange = (event: MediaQueryListEvent) => (event.matches ? engage() : release());
    this.media.addEventListener("change", onMediaChange);
    register(() => this.media.removeEventListener("change", onMediaChange));

    const observer = new MutationObserver(() => (hasPrintContainer() ? engage() : release()));
    observer.observe(document.body, { childList: true });
    register(() => observer.disconnect());
  }

  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.hooks.suspend();
  }

  /** Resumes only once every live signal has cleared; later signals retry it. */
  private release(): void {
    if (!this.engaged) return;
    if (this.media.matches || hasPrintContainer()) return;
    this.engaged = false;
    this.hooks.resume();
  }
}

function hasPrintContainer(): boolean {
  return document.body.querySelector(":scope > .print") !== null;
}
