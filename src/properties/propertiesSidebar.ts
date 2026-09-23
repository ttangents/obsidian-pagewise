import type { App } from "obsidian";

const PROPERTIES_VIEW_TYPE = "file-properties";

/**
 * On-demand access to Obsidian's core Properties sidebar view. Nothing here runs
 * unless the user asks: the toolbar's info button is the only caller, and pagination
 * itself never opens the sidebar.
 *
 * The toggle is keyed on visibility, not leaf existence: a dormant properties leaf
 * in a collapsed sidebar counts as closed, so one click always produces one visible
 * state change (open when hidden, close when shown).
 */
export class PropertiesSidebar {
  constructor(private readonly app: App) {}

  toggle(): void {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(PROPERTIES_VIEW_TYPE)[0];
    const sidebarOpen = !(workspace.rightSplit?.collapsed ?? true);
    if (existing && sidebarOpen) {
      workspace.rightSplit.collapse();
      return;
    }
    if (existing) {
      void workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    void leaf.setViewState({ type: PROPERTIES_VIEW_TYPE, active: true }).then(() => {
      void workspace.revealLeaf(leaf);
    });
  }
}
