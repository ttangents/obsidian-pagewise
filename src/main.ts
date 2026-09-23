import { Plugin } from "obsidian";
import { PaginationController } from "./pagination/controller";
import { PrintGuard } from "./printGuard";
import { PropertiesSidebar } from "./properties/propertiesSidebar";
import { normalizeSettings, type PagewiseSettings } from "./settings";
import { PagewiseSettingTab, type SettingsHost } from "./settingsTab";
import { NoteToolbar } from "./toolbar/noteToolbar";

/**
 * Composition root: builds the components, connects them to Obsidian's events, and
 * owns the settings. The components do not know about each other; every connection
 * between them is made here.
 */
export default class PagewisePlugin extends Plugin implements SettingsHost {
  settings!: PagewiseSettings;
  private controller!: PaginationController;
  private toolbar!: NoteToolbar;
  private printGuard!: PrintGuard;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.controller = new PaginationController(this.app, this.settings);
    const propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, { toggleProperties: () => propertiesSidebar.toggle() });
    this.printGuard = new PrintGuard({
      suspend: () => {
        this.controller.suspend();
        this.toolbar.suspend();
      },
      resume: () => {
        this.controller.resume();
        this.syncToolbar();
      },
    });
    this.printGuard.install((teardown) => this.register(teardown));

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
    this.controller.dispose();
    this.toolbar.dispose();
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
      // The PDF exporter renders into a .print tree; its renders must never
      // schedule a layout pass (see PrintGuard).
      if (this.printGuard.isPrinting() || el.closest(".print")) return;
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
    this.registerEvent(workspace.on("active-leaf-change", () => this.controller.requestLayout()));
    this.registerEvent(workspace.on("css-change", () => this.controller.requestLayout()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
  }

  /** Every paginated pane carries the note toolbar; unpaginated panes carry none. */
  private syncToolbar(): void {
    this.toolbar.sync((view) => this.controller.isPaginated(view), this.settings.toolbarDirection);
  }
}
