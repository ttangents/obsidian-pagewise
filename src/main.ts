import { debounce, Plugin, type Events } from "obsidian";
import { PaginationController } from "./pagination/controller";
import { PropertiesSidebar } from "./properties/propertiesSidebar";
import { normalizeSettings, type PagewiseSettings } from "./settings";
import { PagewiseSettingTab, type SettingsHost } from "./settingsTab";
import { MentionLinks } from "./backlinks/mentionLinks";
import { readingDepthFrom } from "./integrations/semanticZoom";
import { getPlugin } from "./obsidianInternals";
import { NoteToolbar } from "./toolbar/noteToolbar";
import { PATTERN_ATTRIBUTE } from "./appearance/backgrounds";
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
  private readonly mentionLinks = new MentionLinks();
  /**
   * The Properties view and the linked-mentions panel update a moment after the
   * active note changes, so the inspector mark, the toolbar's pressed state and the
   * mention restyling are applied after they settle.
   */
  private readonly syncSettled = debounce(() => this.syncSettledNow(), 50, true);

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.controller = new PaginationController(this.app, this.settings);
    this.propertiesSidebar = new PropertiesSidebar(this.app);
    this.toolbar = new NoteToolbar(this.app, {
      toggleProperties: (view) => this.propertiesSidebar.toggle(view.file),
      propertiesShown: (view) => this.propertiesSidebar.isShownFor(view.file),
      background: () => this.settings.background,
      setBackground: (id) => void this.updateSettings({ background: id }),
      readingDepth: () => readingDepthFrom(getPlugin(this.app, "semantic-zoom")),
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
    this.syncSettled.cancel();
    this.controller.dispose();
    this.toolbar.dispose();
    this.propertiesSidebar.dispose();
    this.mentionLinks.dispose();
    markdownViews(this.app).forEach((view) => view.containerEl.removeAttribute(PATTERN_ATTRIBUTE));
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
        this.syncSettled();
      })
    );
    this.registerEvent(workspace.on("css-change", () => this.controller.requestLayout()));
    // Semantic Zoom announces when its API appears or goes away (enabled, reloaded, disabled), so the
    // Reading depth button follows it without waiting for the next layout change.
    this.registerEvent((workspace as Events).on("semantic-zoom:api", () => this.toolbar.refreshState()));
    // Fires when a sidebar opens or closes, which changes what Properties shows.
    this.registerEvent(workspace.on("resize", () => this.syncSettled()));
    this.registerEvent(this.app.vault.on("rename", () => this.syncSettled()));
    this.registerDomEvent(window, "resize", () => this.controller.requestLayout());
  }

  /** Every paginated pane carries the document toolbar; unpaginated panes carry none. */
  private syncToolbar(): void {
    this.syncBackground();
    this.toolbar.sync((view) => this.controller.isPaginated(view));
    this.syncSettled();
  }

  /** Marks each paginated pane with the chosen pattern; plain and unpaginated panes carry none. */
  private syncBackground(): void {
    const pattern = this.settings.background;
    markdownViews(this.app).forEach((view) => {
      if (pattern !== "plain" && this.controller.isPaginated(view)) view.containerEl.setAttribute(PATTERN_ATTRIBUTE, pattern);
      else view.containerEl.removeAttribute(PATTERN_ATTRIBUTE);
    });
  }

  /** Marks the Properties views showing paginated notes, updates the toolbars' Properties state, and restyles the mention cards. */
  private syncSettledNow(): void {
    const paginatedViews = markdownViews(this.app).filter((view) => this.controller.isPaginated(view));
    const paginated = new Set<string>();
    paginatedViews.forEach((view) => {
      if (view.file) paginated.add(view.file.path);
    });
    this.propertiesSidebar.syncInspectors(paginated);
    this.toolbar.refreshState();
    this.mentionLinks.sync(paginatedViews.map((view) => view.containerEl));
  }

}
