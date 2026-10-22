import { FileView, type App, type TFile, type WorkspaceLeaf } from "obsidian";

const PROPERTIES_VIEW_TYPE = "file-properties";
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
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      if (!(leaf.view instanceof FileView)) return;
      const file = leaf.view.file;
      const active = !!file && paginatedPaths.has(file.path);
      leaf.view.containerEl.classList.toggle(INSPECTOR_CLASS, active);
      const content = leaf.view.contentEl;
      let header = content.querySelector<HTMLElement>(`:scope > .${HEADER_CLASS}`);
      if (!active || !file) {
        header?.remove();
        return;
      }
      if (!header) {
        header = createHeader(content.ownerDocument);
        content.prepend(header);
      }
      const name = header.querySelector<HTMLElement>(".pagewise-inspector-file");
      if (name && name.textContent !== file.basename) name.textContent = file.basename;
    });
  }

  /** Removes every inspector mark and heading Pagewise added. */
  dispose(): void {
    this.app.workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE).forEach((leaf) => {
      leaf.view.containerEl.classList.remove(INSPECTOR_CLASS);
      leaf.view.containerEl.querySelectorAll(`.${HEADER_CLASS}`).forEach((el) => el.remove());
    });
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

function createHeader(doc: Document): HTMLElement {
  const header = doc.createElement("div");
  header.className = HEADER_CLASS;
  const title = doc.createElement("div");
  title.className = "pagewise-inspector-title";
  title.textContent = "Properties";
  const file = doc.createElement("div");
  file.className = "pagewise-inspector-file";
  header.append(title, file);
  return header;
}
