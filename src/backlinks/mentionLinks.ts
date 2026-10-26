import { Style, inlineStyles } from "./inlineMarkdown";

const MATCH_SELECTOR = ".search-result-file-match";
/** Every wrapper Pagewise adds carries this class, plus one class per style. */
const WRAP_CLASS = "pagewise-md";
const STYLE_CLASSES: readonly [number, string][] = [
  [Style.SYNTAX, "pagewise-md-syntax"],
  [Style.LINK, "pagewise-md-link"],
  [Style.BOLD, "pagewise-md-bold"],
  [Style.ITALIC, "pagewise-md-italic"],
  [Style.HIGHLIGHT, "pagewise-md-highlight"],
  [Style.STRIKE, "pagewise-md-strike"],
  [Style.CODE, "pagewise-md-code"],
];
/** The "more context" controls Obsidian puts inside each excerpt. */
const SKIP_SELECTOR = ".search-result-hover-button";
/** A card whose only mentions are in the source note's properties; styles.css hides it. */
const PROPERTY_ONLY_CLASS = "pagewise-mention-property-only";
/** The compact line that lists those notes instead. */
const ALSO_LINKED_CLASS = "pagewise-also-linked";

/**
 * Shows the excerpts in the linked-mention cards of paginated panes as Obsidian renders
 * notes: links as their names, ==highlights== highlighted, **bold** bold, and so on,
 * with the Markdown markers hidden. Obsidian renders the excerpts as raw Markdown and re-renders
 * them as the list scrolls or expands, so a MutationObserver on each pane's mentions
 * panel restyles every excerpt it adds.
 *
 * The excerpt text stays intact: the markers are wrapped in a hidden span and the
 * styled words in styled ones, so removing the wrappers restores Obsidian's rendering.
 *
 * Notes that mention this one only in their properties get no card. They are listed
 * by name in one line under the cards, "Also linked from properties in: …", and each
 * name opens its note through Obsidian's own result title, so modifier keys work.
 */
export class MentionLinks {
  private readonly watched = new Map<HTMLElement, MutationObserver>();
  /** Panels waiting for their property-only line to be redrawn, at most once per frame. */
  private readonly pending = new Set<HTMLElement>();
  /** The scheduled redraw, with the window whose frame it waits for (a pop-out has its own). */
  private frame: { win: Window; id: number } | null = null;

  /** Watches the mentions panels of these panes and releases every other one. */
  sync(paneRoots: readonly HTMLElement[]): void {
    const current = new Set<HTMLElement>();
    paneRoots.forEach((root) =>
      root.querySelectorAll<HTMLElement>(".embedded-backlinks").forEach((panel) => current.add(panel))
    );
    this.watched.forEach((observer, panel) => {
      if (current.has(panel) && panel.isConnected) return;
      observer.disconnect();
      this.watched.delete(panel);
      restore(panel);
    });
    current.forEach((panel) => {
      if (this.watched.has(panel)) return;
      const Observer = panel.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer((records) => {
        // The line Pagewise draws is itself a mutation; only Obsidian's changes count.
        const own = records.every((record) => (record.target as Element).closest?.(`.${ALSO_LINKED_CLASS}`));
        if (own) return;
        records.forEach((record) => this.onMutation(record));
        this.schedule(panel);
      });
      observer.observe(panel, { childList: true, subtree: true });
      this.watched.set(panel, observer);
      panel.querySelectorAll<HTMLElement>(MATCH_SELECTOR).forEach(styleExcerpt);
      this.schedule(panel);
    });
  }

  dispose(): void {
    if (this.frame !== null) this.frame.win.cancelAnimationFrame(this.frame.id);
    this.frame = null;
    this.pending.clear();
    this.watched.forEach((observer, panel) => {
      observer.disconnect();
      restore(panel);
    });
    this.watched.clear();
  }

  private schedule(panel: HTMLElement): void {
    this.pending.add(panel);
    if (this.frame !== null) return;
    const win = panel.win;
    const id = win.requestAnimationFrame(() => {
      this.frame = null;
      const panels = [...this.pending];
      this.pending.clear();
      panels.forEach((target) => {
        const observer = this.watched.get(target);
        if (!observer) return;
        gatherPropertyOnly(target);
        // Pagewise's own edits must not wake the observer that triggered them.
        observer.takeRecords();
      });
    });
    this.frame = { win, id };
  }

  private onMutation(record: MutationRecord): void {
    const target = record.target.instanceOf(Element) ? record.target : record.target.parentElement;
    const enclosing = target?.closest<HTMLElement>(MATCH_SELECTOR);
    if (enclosing) {
      styleExcerpt(enclosing);
      return;
    }
    record.addedNodes.forEach((node) => {
      if (!node.instanceOf(Element)) return;
      if (node.matches(MATCH_SELECTOR)) styleExcerpt(node as HTMLElement);
      node.querySelectorAll<HTMLElement>(MATCH_SELECTOR).forEach(styleExcerpt);
    });
  }
}

/**
 * Wraps the Markdown markers and styled words of one excerpt. A link or highlight may
 * run across Obsidian's spans (the highlighted mention is its own span), so the text
 * is read as one string and the result applied node by node. Text already wrapped is
 * left alone, so running this again changes nothing.
 */
function styleExcerpt(excerpt: HTMLElement): void {
  const nodes = textNodes(excerpt);
  const text = nodes.map((node) => node.data).join("");
  if (!/[[\]=*_~`\\]/.test(text)) return;
  const kinds = inlineStyles(text);
  if (!kinds.some(Boolean)) return;
  let offset = 0;
  nodes.forEach((node) => {
    const length = node.data.length;
    const slice = kinds.subarray(offset, offset + length);
    offset += length;
    if (!slice.some(Boolean)) return;
    const pieces: (string | HTMLElement)[] = [];
    let runStart = 0;
    for (let i = 1; i <= length; i++) {
      if (i < length && slice[i] === slice[runStart]) continue;
      const piece = node.data.slice(runStart, i);
      const kind = slice[runStart];
      if (kind === 0) {
        pieces.push(piece);
      } else {
        // Created inside the excerpt, so it belongs to the excerpt's window; replaceWith moves it into place.
        const classes = [WRAP_CLASS, ...STYLE_CLASSES.filter(([bit]) => kind & bit).map(([, name]) => name)];
        pieces.push(excerpt.createSpan({ cls: classes, text: piece }));
      }
      runStart = i;
    }
    node.replaceWith(...pieces);
  });
}

/** The excerpt's text nodes in order, leaving out Obsidian's controls and anything already wrapped. */
function textNodes(excerpt: HTMLElement): Text[] {
  const doc = excerpt.ownerDocument;
  const walker = doc.createTreeWalker(excerpt, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(`${SKIP_SELECTOR}, .${WRAP_CLASS}`)) continue;
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * Marks the cards whose rendered mentions are all property matches and lists those
 * notes in one line after their result list. A card whose mentions have not rendered
 * yet is left as it is. A property match is the one kind Obsidian builds without its
 * "more context" buttons.
 */
function gatherPropertyOnly(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>(".search-result-container").forEach((container) => {
    const cards: HTMLElement[] = [];
    container.querySelectorAll<HTMLElement>(".search-result").forEach((card) => {
      const matches = Array.from(card.querySelectorAll<HTMLElement>(MATCH_SELECTOR));
      const propertyOnly =
        matches.length > 0 && matches.every((match) => !match.querySelector(`:scope > ${SKIP_SELECTOR}`));
      card.classList.toggle(PROPERTY_ONLY_CLASS, propertyOnly);
      if (propertyOnly) cards.push(card);
    });
    let line = container.nextElementSibling?.classList.contains(ALSO_LINKED_CLASS)
      ? (container.nextElementSibling as HTMLElement)
      : null;
    if (cards.length === 0) {
      line?.remove();
      return;
    }
    const names = cards.map((card) => card.querySelector(".search-result-file-title .tree-item-inner")?.textContent ?? "");
    if (line?.dataset.names === JSON.stringify(names)) return;
    if (!line) {
      line = container.parentElement?.createDiv({ cls: ALSO_LINKED_CLASS }) ?? null;
      if (!line) return;
      container.after(line);
    }
    drawLine(line, cards, names);
  });
}

function drawLine(line: HTMLElement, cards: HTMLElement[], names: string[]): void {
  line.dataset.names = JSON.stringify(names);
  line.replaceChildren();
  line.createSpan({ cls: "pagewise-also-linked-label", text: "Also linked from properties in " });
  cards.forEach((card, index) => {
    const name = line.createSpan({ cls: "pagewise-also-linked-note", text: names[index], attr: { role: "link", tabindex: "0" } });
    const open = (event: MouseEvent | KeyboardEvent) => {
      const title = card.querySelector<HTMLElement>(".search-result-file-title");
      title?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey })
      );
    };
    name.addEventListener("click", open);
    name.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      open(event);
    });
    if (index < cards.length - 1) line.appendText(", ");
  });
}

/** Puts every wrapped piece back as plain text, as Obsidian rendered it. */
function restore(panel: HTMLElement): void {
  panel.querySelectorAll(`.${ALSO_LINKED_CLASS}`).forEach((line) => line.remove());
  panel.querySelectorAll(`.${PROPERTY_ONLY_CLASS}`).forEach((card) => card.classList.remove(PROPERTY_ONLY_CLASS));
  panel.querySelectorAll<HTMLElement>(`.${WRAP_CLASS}`).forEach((span) => {
    const parent = span.parentElement;
    span.replaceWith(span.ownerDocument.createTextNode(span.textContent ?? ""));
    parent?.normalize();
  });
}
