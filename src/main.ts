import { Plugin, type MarkdownView } from "obsidian";
import { PaginationController } from "./controller";
import { NoteToolbar } from "./noteToolbar";
import { PrintGuard } from "./printGuard";
import { PropertiesSidebar } from "./propertiesSidebar";
import { DEFAULT_SETTINGS, PagewiseSettingTab, type PagewiseSettings } from "./settings";

export default class PagewisePlugin extends Plugin {
  settings: PagewiseSettings = DEFAULT_SETTINGS;
  private controller!: PaginationController;
  private toolbar!: NoteToolbar;
  private printGuard!: PrintGuard;

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    this.controller = new PaginationController(this.app, this.settings);
    const propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, {
      toggleProperties: () => propertiesSidebar.toggle(),
    });
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
    this.registerMarkdownPostProcessor((el) => {
      // The exporter renders into a detached/.print tree; never let that render
      // schedule a layout pass. The guard also stays quiet mid-export even when
      // the element is not yet attached under .print at processing time.
      if (this.printGuard.isPrinting() || el.closest(".print")) return;
      this.controller.requestLayout();
    });
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.controller.noteOpened();
        this.syncToolbar();
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.controller.requestLayout();
        this.syncToolbar();
      })
    );
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.controller.requestLayout()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.controller.requestLayout()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
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

  /** Merges a partial change into settings, persists it, and re-applies active panes. */
  async updateSettings(patch: Partial<PagewiseSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.saveData(this.settings);
    this.controller.applySettings(this.settings);
    this.syncToolbar();
  }

  /** Every paginated pane carries the note toolbar; unpaginated panes carry none. */
  private syncToolbar(): void {
    this.toolbar.sync((view: MarkdownView) => this.controller.isPaginated(view));
  }
}
