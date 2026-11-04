/**
 * Watches one Reading view sheet for changes that move page breaks without any
 * Markdown being re-rendered: the sheet's width (pane resize, sidebar toggle) and
 * the height of each rendered block. Blocks that other plugins or Obsidian finish
 * drawing after the post-processor has run, such as Dataview and Tasks query
 * results, Mermaid diagrams, Excalidraw embeds and images, grow in place, and only
 * their size reveals it.
 *
 * Pure apart from the observer it is handed, so it is unit-tested with a fake one.
 */

/** The part of ResizeObserver the watcher uses. */
export interface SizeObserver {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

/** One size notification: the element and its new border-box size. */
export interface SizeEntry {
  target: Element;
  width: number;
  height: number;
}

/** Builds an observer that reports size changes as entries. */
export type SizeObserverFactory = (callback: (entries: readonly SizeEntry[]) => void) => SizeObserver;

/** Changes smaller than this, in CSS pixels, come from sub-pixel rounding and move no break. */
const TOLERANCE_PX = 0.5;

/** Asks for a layout when one sheet's width or one of its measured blocks changes size. */
export class BlockWatcher {
  private readonly observer: SizeObserver;
  /** The last size seen of each watched element: width for the sheet, height for a block. */
  private readonly sizes = new Map<Element, number>();
  private blocks = new Set<Element>();

  /**
   * @param sheet the element whose width decides line wrapping
   * @param onChange called once per batch of notifications that moved anything
   */
  constructor(
    private readonly sheet: Element,
    createObserver: SizeObserverFactory,
    private readonly onChange: () => void
  ) {
    this.observer = createObserver((entries) => this.notified(entries));
    this.observer.observe(sheet);
  }

  /**
   * Watches exactly these blocks: the ones the latest layout measured. Blocks that
   * left the sheet (Reading view unloads sections out of view) are let go.
   */
  track(blocks: readonly Element[]): void {
    const next = new Set(blocks);
    this.blocks.forEach((block) => {
      if (next.has(block)) return;
      this.observer.unobserve(block);
      this.sizes.delete(block);
    });
    next.forEach((block) => {
      if (!this.blocks.has(block)) this.observer.observe(block);
    });
    this.blocks = next;
  }

  /** Stops watching everything; the watcher is unusable afterwards. */
  dispose(): void {
    this.observer.disconnect();
    this.sizes.clear();
    this.blocks.clear();
  }

  private notified(entries: readonly SizeEntry[]): void {
    let moved = false;
    for (const { target, width, height } of entries) {
      const size = target === this.sheet ? width : height;
      const previous = this.sizes.get(target);
      this.sizes.set(target, size);
      // The first notification after observe() reports the size the layout just
      // measured; only a later change can move a break.
      if (previous !== undefined && Math.abs(size - previous) > TOLERANCE_PX) moved = true;
    }
    if (moved) this.onChange();
  }
}

/** A factory over the ResizeObserver of the window that owns `el`, so pop-out windows are watched too. */
export function resizeObserverFor(el: Element): SizeObserverFactory {
  const Observer = el.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver;
  return (callback) =>
    new Observer((entries) =>
      callback(
        entries.map((entry) => {
          const box = entry.borderBoxSize?.[0];
          return {
            target: entry.target,
            width: box?.inlineSize ?? entry.contentRect.width,
            height: box?.blockSize ?? entry.contentRect.height,
          };
        })
      )
    );
}
