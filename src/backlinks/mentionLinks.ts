import { getLinkpath, type App } from "obsidian";
import { ALSO_LINKED_CLASS, removeAlsoLinked, showAlsoLinked, type AlsoLinkedNote } from "./alsoLinked";
import { styleExcerpt, unstyleExcerpts } from "./excerpts";
import { propertyOnlyNames, type LinkIndex } from "./propertyLinks";
import { DOM } from "../obsidianDom";

/** A card whose only mentions are in the source note's properties; styles.css hides it. */
const PROPERTY_ONLY_CLASS = "pagewise-mention-property-only";

/**
 * Runs the linked-mentions panel of each paginated pane. Obsidian renders the excerpts
 * as raw Markdown and re-renders them as the list scrolls or expands, so a
 * MutationObserver on each panel restyles every excerpt it adds (excerpts.ts): links
 * as their names, ==highlights== highlighted, callout markers hidden, and so on.
 *
 * Notes that mention this one only in their properties get no card. They are listed
 * as pills in one line under the cards (alsoLinked.ts), and each pill opens its note
 * through Obsidian's own result title, so modifier keys work. Which notes those are
 * comes from Obsidian's metadata cache (propertyLinks.ts); the panel's DOM serves only
 * to find each note's card by its title.
 */
export class MentionLinks {
  private readonly watched = new Map<HTMLElement, MutationObserver>();
  /** The note each watched panel lists mentions of. */
  private readonly targets = new Map<HTMLElement, string>();
  /** Panels waiting for their property-only line to be redrawn, at most once per frame. */
  private readonly pending = new Set<HTMLElement>();
  /** The scheduled redraw, with the window whose frame it waits for (a pop-out has its own). */
  private frame: { win: Window; id: number } | null = null;

  constructor(private readonly links: LinkIndex) {}

  /** Watches the mentions panels of these panes and releases every other one. */
  sync(panes: readonly { root: HTMLElement; path: string | null }[]): void {
    const current = new Map<HTMLElement, string>();
    panes.forEach(({ root, path }) => {
      if (path === null) return;
      root.querySelectorAll<HTMLElement>(DOM.embeddedBacklinks).forEach((panel) => current.set(panel, path));
    });
    this.watched.forEach((observer, panel) => {
      if (current.has(panel) && panel.isConnected) return;
      observer.disconnect();
      this.watched.delete(panel);
      this.targets.delete(panel);
      restore(panel);
    });
    current.forEach((path, panel) => {
      if (this.targets.get(panel) !== path) {
        // A pane that now shows another note reuses its panel; its line is redrawn for the new note.
        this.targets.set(panel, path);
        if (this.watched.has(panel)) this.schedule(panel);
      }
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
      panel.querySelectorAll<HTMLElement>(DOM.resultMatch).forEach(styleExcerpt);
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
    this.targets.clear();
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
        const path = this.targets.get(target);
        if (!observer || path === undefined) return;
        gatherPropertyOnly(target, path, propertyOnlyNames(this.links, path));
        // Pagewise's own edits must not wake the observer that triggered them.
        observer.takeRecords();
      });
    });
    this.frame = { win, id };
  }

  private onMutation(record: MutationRecord): void {
    const target = record.target.instanceOf(Element) ? record.target : record.target.parentElement;
    const enclosing = target?.closest<HTMLElement>(DOM.resultMatch);
    if (enclosing) {
      styleExcerpt(enclosing);
      return;
    }
    record.addedNodes.forEach((node) => {
      if (!node.instanceOf(Element)) return;
      if (node.matches(DOM.resultMatch)) styleExcerpt(node as HTMLElement);
      node.querySelectorAll<HTMLElement>(DOM.resultMatch).forEach(styleExcerpt);
    });
  }
}

/**
 * Marks the linked-mention cards of the notes that link here only from their
 * properties, and lists those notes in one line after the cards. Unlinked mentions,
 * the panel's second result list, are text matches and stay as they are.
 */
function gatherPropertyOnly(panel: HTMLElement, notePath: string, propertyOnly: ReadonlySet<string>): void {
  const list = panel.querySelector<HTMLElement>(DOM.resultList);
  if (!list) return;
  const notes: AlsoLinkedNote[] = [];
  list.querySelectorAll<HTMLElement>(DOM.resultCard).forEach((card) => {
    const name = card.querySelector(DOM.resultTitleText)?.textContent ?? "";
    const hide = propertyOnly.has(name);
    card.classList.toggle(PROPERTY_ONLY_CLASS, hide);
    if (hide) notes.push({ name, open: (event) => openCard(card, event) });
  });
  showAlsoLinked(list, notePath, notes);
}

/** Opens a card's note by clicking its title, passing on the modifier keys of `event`. */
function openCard(card: HTMLElement, event: MouseEvent | KeyboardEvent): void {
  const { metaKey, ctrlKey, shiftKey, altKey } = event;
  card
    .querySelector<HTMLElement>(DOM.resultTitle)
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey, ctrlKey, shiftKey, altKey }));
}

/** Puts the panel back as Obsidian rendered it. */
function restore(panel: HTMLElement): void {
  removeAlsoLinked(panel);
  panel.querySelectorAll(`.${PROPERTY_ONLY_CLASS}`).forEach((card) => card.classList.remove(PROPERTY_ONLY_CLASS));
  unstyleExcerpts(panel);
}

/** Obsidian's metadata cache, read through the public MetadataCache API. */
export function metadataLinkIndex(app: App): LinkIndex {
  const { metadataCache } = app;
  return {
    sourcesOf: (targetPath) =>
      Object.entries(metadataCache.resolvedLinks)
        .filter(([, targets]) => (targets[targetPath] ?? 0) > 0)
        .map(([source]) => source),
    linksOf: (path) => {
      const file = app.vault.getFileByPath(path);
      return file ? metadataCache.getFileCache(file) : null;
    },
    resolve: (link, sourcePath) => metadataCache.getFirstLinkpathDest(getLinkpath(link), sourcePath)?.path ?? null,
  };
}
