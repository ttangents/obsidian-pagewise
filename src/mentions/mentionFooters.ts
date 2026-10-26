import { getLinkpath, type App } from "obsidian";
import { MentionFooter } from "./mentionFooter";
import type { LinkIndex } from "./mentionIndex";
import { DOM } from "../obsidianDom";

/** A pane Pagewise paginates: its container and the path of the note it shows. */
export interface MentionPane {
  root: HTMLElement;
  path: string | null;
}

/**
 * Keeps one mention footer in each paginated pane and none elsewhere. The footer
 * sits inside the pane's in-document backlinks container, which Obsidian shows only
 * while "Backlinks in document" is on and moves with the note between Reading view
 * and Live Preview; the stylesheet hides Obsidian's own panel there. Unpaginated
 * panes and the Backlinks sidebar keep Obsidian's panel as it is.
 */
export class MentionFooters {
  private readonly footers = new Map<HTMLElement, MentionFooter>();

  constructor(
    private readonly app: App,
    private readonly index: LinkIndex
  ) {}

  /** Adds footers to these panes, moves them when a pane changes note, and removes every other one. */
  sync(panes: readonly MentionPane[]): void {
    const wanted = new Map<HTMLElement, { host: HTMLElement; path: string }>();
    panes.forEach(({ root, path }) => {
      const host = root.querySelector<HTMLElement>(DOM.embeddedBacklinks);
      if (host && path !== null) wanted.set(root, { host, path });
    });
    this.footers.forEach((footer, root) => {
      const want = wanted.get(root);
      // Obsidian empties the container when "Backlinks in document" turns off, taking the footer with it.
      if (want && want.path === footer.notePath && footer.el.parentElement === want.host) return;
      footer.unload();
      this.footers.delete(root);
    });
    wanted.forEach(({ host, path }, root) => {
      if (this.footers.has(root)) return;
      const footer = new MentionFooter(this.app, this.index, host, path);
      footer.load();
      this.footers.set(root, footer);
    });
  }

  /** Re-reads every footer's mentions, after Obsidian's metadata changed. */
  refresh(): void {
    this.footers.forEach((footer) => void footer.refresh());
  }

  dispose(): void {
    this.footers.forEach((footer) => footer.unload());
    this.footers.clear();
  }
}

/** Obsidian's metadata cache, read through the public MetadataCache API. */
export function obsidianLinkIndex(app: App): LinkIndex {
  const { metadataCache } = app;
  return {
    sourcesOf: (targetPath) =>
      Object.entries(metadataCache.resolvedLinks)
        .filter(([, targets]) => (targets[targetPath] ?? 0) > 0)
        .map(([source]) => source),
    cacheOf: (path) => {
      const file = app.vault.getFileByPath(path);
      return file ? metadataCache.getFileCache(file) : null;
    },
    resolve: (link, sourcePath) => metadataCache.getFirstLinkpathDest(getLinkpath(link), sourcePath)?.path ?? null,
  };
}
