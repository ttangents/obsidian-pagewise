import { FileView, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import { DOM } from "../obsidianDom";
import { LIST_ROW_CLASS, markListRows } from "./listRows";

const PROPERTIES_VIEW_TYPE = DOM.propertiesViewType;
const INSPECTOR_CLASS = "pagewise-inspector";
const HEADER_CLASS = "pagewise-inspector-header";

/**
 * Pagewise's link to Obsidian's core Properties view. Pagewise never builds its own
 * property editors: it opens the core view, reports whether it shows a given note,
 * and marks it as a Pagewise inspector while the note it shows is paginated, so
 * styles.css can refine that view without touching any other Properties pane.
 *
 * Obsidian's unpinned Properties view always shows the active note, so callers make
 * the note's pane active before calling toggle().
 */
export class PropertiesSidebar {
  /** One observer per marked inspector, which marks its list rows again after Obsidian redraws them. */
  private readonly rowWatchers = new Map<HTMLElement, MutationObserver>();

  constructor(private readonly app: App) {}

  /**
   * Shows the note's properties, or hides the sidebar holding them if they already
   * show. Pinned views are treated as Obsidian's "Show file properties" command treats
   * them: one pinned to this note is reused, others are left alone. Unlike that
   * command, focus stays in the note.
   */
  async toggle(file: TFile | null): Promise<void> {
    if (!file) return;
    const { workspace } = this.app;
    const shown = this.visibleLeafFor(file);
    if (shown) {
      // Hide by collapsing the sidebar it sits in. A Properties view the user placed
      // among the notes stays where it is; closing a tab is the user's call.
      const sidedock = this.sidedockOf(shown);
      sidedock?.collapse();
      return;
    }
    const leaves = workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE);
    const leaf =
      leaves.find((candidate) => isPinned(candidate) && pathOf(candidate) === file.path) ??
      leaves.find((candidate) => !isPinned(candidate)) ??
      workspace.getRightLeaf(false);
    if (!leaf) return;
    if (pathOf(leaf) === null) await leaf.setViewState({ type: PROPERTIES_VIEW_TYPE, state: { file: file.path } });
    await workspace.revealLeaf(leaf);
  }

  /** True while a visible Properties view shows this note. */
  isShownFor(file: TFile | null): boolean {
    return !!file && this.visibleLeafFor(file) !== null;
  }

  /**
   * Marks each Properties view as a Pagewise inspector exactly while the note it
   * shows is paginated, and gives it a heading naming that note. The name comes from
   * the view itself, so a pinned view names its pinned note.
   */
  syncInspectors(paginatedPaths: ReadonlySet<string>): void {
    // A closed Properties view leaves its content detached; stop watching it.
    this.rowWatchers.forEach((watcher, content) => {
      if (content.isConnected) return;
      watcher.disconnect();
      this.rowWatchers.delete(content);
    });
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      if (!(leaf.view instanceof FileView)) return;
      const file = leaf.view.file;
      const active = !!file && paginatedPaths.has(file.path);
      leaf.view.containerEl.classList.toggle(INSPECTOR_CLASS, active);
      const content = leaf.view.contentEl;
      if (active) this.watchRows(content);
      else this.unwatchRows(content);
      let header = content.querySelector<HTMLElement>(`:scope > .${HEADER_CLASS}`);
      if (!active || !file) {
        header?.remove();
        return;
      }
      if (!header) {
        header = createHeader(content);
        content.prepend(header);
      }
      const name = header.querySelector<HTMLElement>(".pagewise-inspector-file");
      if (name && name.textContent !== file.basename) name.textContent = file.basename;
    });
  }

  /** Removes every inspector mark and heading Pagewise added. */
  dispose(): void {
    [...this.rowWatchers.keys()].forEach((content) => this.unwatchRows(content));
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      leaf.view.containerEl.classList.remove(INSPECTOR_CLASS);
      leaf.view.containerEl.querySelectorAll(`.${HEADER_CLASS}`).forEach((el) => el.remove());
    });
  }

  /** Marks the inspector's list rows now and after every redraw. Changing a class is not a change the observer watches, so marking never wakes it. */
  private watchRows(content: HTMLElement): void {
    markListRows(content);
    if (this.rowWatchers.has(content)) return;
    // The observer of the window that holds the view, so a pop-out window is watched too.
    const Mutations = content.doc.defaultView?.MutationObserver ?? MutationObserver;
    const watcher = new Mutations(() => markListRows(content));
    watcher.observe(content, { childList: true, subtree: true });
    this.rowWatchers.set(content, watcher);
  }

  /** Stops watching and takes the marks off, for a view that no longer shows a paginated note. */
  private unwatchRows(content: HTMLElement): void {
    this.rowWatchers.get(content)?.disconnect();
    this.rowWatchers.delete(content);
    content.querySelectorAll(`.${LIST_ROW_CLASS}`).forEach((el) => el.classList.remove(LIST_ROW_CLASS));
  }

  private visibleLeafFor(file: TFile): WorkspaceLeaf | null {
    return (
      this.app.workspace
        .getLeavesOfType(PROPERTIES_VIEW_TYPE)
        .find((leaf) => pathOf(leaf) === file.path && !this.sidedockOf(leaf)?.collapsed && leaf.view.containerEl.isShown()) ??
      null
    );
  }

  /** The left or right sidebar holding the leaf; null for a leaf among the notes or in a pop-out. */
  private sidedockOf(leaf: WorkspaceLeaf) {
    const { leftSplit, rightSplit } = this.app.workspace;
    const root = leaf.getRoot();
    return root === rightSplit ? rightSplit : root === leftSplit ? leftSplit : null;
  }
}

/** The note a Properties view shows: its loaded file, or, while the leaf is deferred, its saved state. */
function pathOf(leaf: WorkspaceLeaf): string | null {
  if (leaf.view instanceof FileView) return leaf.view.file?.path ?? null;
  const file = leaf.getViewState().state?.file;
  return typeof file === "string" ? file : null;
}

function isPinned(leaf: WorkspaceLeaf): boolean {
  return leaf.getViewState().pinned === true;
}

/** Builds the heading inside the view's content; the caller moves it to the top. */
function createHeader(content: HTMLElement): HTMLElement {
  const header = content.createDiv({ cls: HEADER_CLASS });
  header.createDiv({ cls: "pagewise-inspector-title", text: "Properties" });
  header.createDiv({ cls: "pagewise-inspector-file" });
  return header;
}
