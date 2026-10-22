import { debounce, Plugin } from "obsidian";
import { PaginationController } from "./pagination/controller";
import { PropertiesSidebar } from "./properties/propertiesSidebar";
import { normalizeSettings, type PagewiseSettings } from "./settings";
import { PagewiseSettingTab, type SettingsHost } from "./settingsTab";
import { NoteToolbar } from "./toolbar/noteToolbar";
import { markdownViews } from "./workspace";

/**
 * Composition root: builds the components, connects them to Obsidian's events, and
 * owns the settings. The components do not know about each other; every connection
 * between them is made here.
 */
export default class PagewisePlugin extends Plugin implements SettingsHost {
  settings!: PagewiseSettings;
  private controller!: PaginationController;
  private toolbar!: NoteToolbar;
  private propertiesSidebar!: PropertiesSidebar;
  /**
   * The Properties view updates a moment after the active note changes, so its
   * inspector mark and the toolbar's pressed state are read after it settles.
   */
  private readonly syncInspector = debounce(() => this.syncInspectorNow(), 50, true);

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.controller = new PaginationController(this.app, this.settings);
    this.propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, {
      toggleProperties: (view) => this.propertiesSidebar.toggle(view.file),
      propertiesShown: (view) => this.propertiesSidebar.isShownFor(view.file),
    });

    this.addCommand({
      id: "toggle-paginated-view",
      name: "Toggle paginated view for this note",
      callback: () => void this.toggle(),
    });
    this.addRibbonIcon("book-open", "Toggle paginated view (Pagewise)", () => void this.toggle());
    this.addSettingTab(new PagewiseSettingTab(this.app, this));
    this.registerLayoutTriggers();
    this.app.workspace.onLayoutReady(() => {
      this.controller.applySettings(this.settings);
      this.syncToolbar();
    });
  }

  onunload(): void {
    this.syncInspector.cancel();
    this.controller.dispose();
    this.toolbar.dispose();
    this.propertiesSidebar.dispose();
  }

  /** Routes the toggle by scope: one ephemeral pane, or the persisted every-note state. */
  async toggle(): Promise<void> {
    if (this.settings.scope === "note") {
      this.controller.toggleActiveView();
      this.syncToolbar();
      return;
    }
    await this.updateSettings({ globalEnabled: !this.settings.globalEnabled });
  }

  /** Merges a partial change into settings, persists it, and re-applies it everywhere. */
  async updateSettings(patch: Partial<PagewiseSettings>): Promise<void> {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    this.controller.applySettings(this.settings);
    this.syncToolbar();
  }

  /** Every event that can change a paginated note's layout or the set of panes. */
  private registerLayoutTriggers(): void {
    const { workspace } = this.app;
    this.registerMarkdownPostProcessor((el) => {
      // PDF export renders the note into a .print container in a hidden window;
      // those renders have nothing for Pagewise to lay out.
      if (el.closest(".print")) return;
      this.controller.requestLayout();
    });
    this.registerEvent(
      workspace.on("file-open", () => {
        this.controller.noteOpened();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      workspace.on("layout-change", () => {
        this.controller.requestLayout();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      workspace.on("active-leaf-change", () => {
        this.controller.requestLayout();
        this.syncInspector();
      })
    );
    this.registerEvent(workspace.on("css-change", () => this.controller.requestLayout()));
    // Fires when a sidebar opens or closes, which changes what Properties shows.
    this.registerEvent(workspace.on("resize", () => this.syncInspector()));
    this.registerEvent(this.app.vault.on("rename", () => this.syncInspector()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
  }

  /** Every paginated pane carries the document toolbar; unpaginated panes carry none. */
  private syncToolbar(): void {
    this.toolbar.sync((view) => this.controller.isPaginated(view));
    this.syncInspector();
  }

  /** Marks the Properties views showing paginated notes, and updates the toolbars' Properties state. */
  private syncInspectorNow(): void {
    const paginated = new Set<string>();
    markdownViews(this.app).forEach((view) => {
      if (view.file && this.controller.isPaginated(view)) paginated.add(view.file.path);
    });
    this.propertiesSidebar.syncInspectors(paginated);
    this.toolbar.refreshState();
  }
}
