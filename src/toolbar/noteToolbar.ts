import { MarkdownView, setIcon, setTooltip, type App, type Menu } from "obsidian";
import type { BackgroundId } from "../appearance/backgrounds";
import type { ReadingDepth } from "../integrations/semanticZoom";
import { executeCommand } from "../obsidianInternals";
import { markdownViews } from "../workspace";
import { fillBlocksMenu, fillHeadingMenu } from "./formatMenus";
import { registerCustomIcons, resolveIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS } from "./markdownActions";
import { BackgroundPalette } from "./backgroundPalette";
import { addEntry, createMenu, whenHidden } from "./menus";
import { fillTableMenu } from "./tableMenu";

const TOOLBAR_CLASS = "pagewise-toolbar";
const HOST_CLASS = "pagewise-has-toolbar";
const OVERFLOWED_CLASS = "is-overflowed";
const EMPTY_CLASS = "is-empty";
const UNAVAILABLE_CLASS = "is-unavailable";

/** What the toolbar asks of its owner beyond formatting. */
export interface ToolbarActions {
  /** Shows or hides the Properties view for the pane's note. The pane is already active. */
  toggleProperties(view: MarkdownView): Promise<void>;
  /** True while a visible Properties view shows the pane's note. */
  propertiesShown(view: MarkdownView): boolean;
  /** The canvas background, shared by every paginated pane. */
  background(): BackgroundId;
  setBackground(id: BackgroundId): void;
  /** Semantic Zoom's reading depths, or null while it is not installed and ready. */
  readingDepth(): ReadingDepth | null;
}

/**
 * One toolbar control. `overflowRank` is the order in which controls move into the
 * More menu as a pane narrows (1 leaves first); they return in reverse order, so a
 * control is always either in its usual place or in More, never reshuffled.
 */
interface Control {
  label: string;
  icon: IconChoice;
  overflowRank: number;
  run?: () => void;
  fill?: (menu: Menu) => void;
}

interface Placed {
  control: Control;
  button: HTMLElement;
  group: HTMLElement;
}

/**
 * The document toolbar: a fixed horizontal bar at the top of each paginated pane,
 * between Obsidian's view header and the scrolling canvas, so it never overlaps the
 * sheet or the find bar and takes no part in pagination. NoteToolbar owns one
 * PaneToolbar per paginated pane and nothing else.
 */
export class NoteToolbar {
  private readonly panes = new Map<MarkdownView, PaneToolbar>();

  constructor(
    private readonly app: App,
    private readonly actions: ToolbarActions
  ) {
    registerCustomIcons(HEADING_LEVELS);
  }

  /** Gives each open Markdown pane a toolbar exactly when the predicate says so. */
  sync(shouldShow: (view: MarkdownView) => boolean): void {
    const views = new Set(markdownViews(this.app));
    this.panes.forEach((pane, view) => {
      if (views.has(view) && view.containerEl.isConnected && shouldShow(view)) return;
      pane.destroy();
      this.panes.delete(view);
    });
    views.forEach((view) => {
      if (!shouldShow(view)) return;
      const pane = this.panes.get(view);
      if (pane) pane.attach();
      else this.panes.set(view, new PaneToolbar(this.app, view, this.actions));
    });
    this.refreshState();
  }

  /** Re-reads state shown on the bars: the Properties button's pressed state. */
  refreshState(): void {
    this.panes.forEach((pane) => pane.refreshState());
  }

  dispose(): void {
    this.panes.forEach((pane) => pane.destroy());
    this.panes.clear();
  }
}

/** The toolbar of one pane: its DOM, its overflow, its keyboard model, and its menus. */
class PaneToolbar {
  private readonly el: HTMLElement;
  private readonly groupsEl: HTMLElement;
  private readonly moreButton: HTMLElement;
  private readonly propertiesButton: HTMLElement;
  private readonly readingDepthButton: HTMLElement;
  private readonly palette: BackgroundPalette;
  private readonly placed: Placed[] = [];
  private readonly observer: ResizeObserver;
  /** The menu this bar has open, if any, and the button it belongs to. */
  private openMenu: { menu: Menu; button: HTMLElement } | null = null;
  /** Whether the More menu was opened from the keyboard; menus it opens inherit that. */
  private moreKeyboard = false;

  constructor(
    private readonly app: App,
    private readonly view: MarkdownView,
    private readonly actions: ToolbarActions
  ) {
    const doc = view.containerEl.ownerDocument;
    this.el = doc.createElement("div");
    this.el.className = TOOLBAR_CLASS;
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", "Document toolbar");
    // A pointer press on the bar must not take focus or the selection from the editor.
    this.el.addEventListener("mousedown", (event) => event.preventDefault());
    this.el.addEventListener("keydown", (event) => this.onKeydown(event));
    this.el.addEventListener("focusin", (event) => this.setTabStop(event.target as HTMLElement));
    // Backstop for a companion plugin that changed without announcing it.
    this.el.addEventListener("pointerenter", () => this.refreshState());

    this.groupsEl = this.el.createDiv({ cls: "pagewise-toolbar-groups" });
    this.controlGroups().forEach((controls) => {
      const group = this.groupsEl.createDiv({ cls: "pagewise-toolbar-group" });
      controls.forEach((control) => {
        const button = control.fill
          ? this.menuButton(control.label, control.icon, control.fill)
          : this.commandButton(control.label, control.icon, control.run!);
        group.append(button);
        this.placed.push({ control, button, group });
      });
    });

    const trailing = this.el.createDiv({ cls: "pagewise-toolbar-trailing" });
    this.moreButton = this.menuButton("More tools", ["ellipsis", "more-horizontal"], (menu) => this.fillMore(menu), false);
    this.moreButton.classList.add("pagewise-toolbar-more", OVERFLOWED_CLASS);
    this.propertiesButton = this.button("Properties", (keyboard) => void this.toggleProperties(keyboard));
    this.propertiesButton.classList.add("pagewise-toolbar-properties");
    this.propertiesButton.setAttribute("aria-pressed", "false");
    setIcon(this.propertiesButton, resolveIcon(["info"]));
    this.readingDepthButton = this.menuButton("Reading depth", ["layers", "list-tree"], (menu) => this.fillReadingDepth(menu));
    this.readingDepthButton.classList.add("pagewise-toolbar-reading-depth", UNAVAILABLE_CLASS);
    const backgroundButton = this.button("Background", () => {
      if (this.palette.isOpen) this.palette.close(false);
      else this.palette.open();
    });
    backgroundButton.setAttribute("aria-haspopup", "dialog");
    backgroundButton.setAttribute("aria-expanded", "false");
    setIcon(backgroundButton, resolveIcon(["swatch-book", "palette"]));
    this.palette = new BackgroundPalette(this.el, backgroundButton, {
      current: () => this.actions.background(),
      choose: (id) => this.actions.setBackground(id),
    });
    trailing.append(this.moreButton, this.readingDepthButton, backgroundButton, this.propertiesButton);

    this.attach();
    this.setTabStop(this.placed[0]?.button ?? this.propertiesButton);
    const Observer = doc.defaultView?.ResizeObserver ?? ResizeObserver;
    // The groups box changes size when the pane resizes and when reading view hides
    // or shows the formatting groups, which are the two events that change the fit.
    this.observer = new Observer(() => this.fit());
    this.observer.observe(this.groupsEl);
  }

  /** Places the bar between the view header and the content; idempotent. */
  attach(): void {
    const container = this.view.containerEl;
    container.classList.add(HOST_CLASS);
    if (this.el.parentElement !== container || this.el.nextElementSibling !== this.view.contentEl) {
      this.view.contentEl.before(this.el);
    }
  }

  refreshState(): void {
    this.propertiesButton.setAttribute("aria-pressed", String(this.actions.propertiesShown(this.view)));
    this.palette.paint();
    this.readingDepthButton.classList.toggle(UNAVAILABLE_CLASS, !this.readingDepthAvailable());
    this.ensureTabStop();
  }

  /** Reading depth shows for a Markdown note while Semantic Zoom is installed and ready. */
  private readingDepthAvailable(): boolean {
    return this.view.file?.extension === "md" && this.actions.readingDepth() !== null;
  }

  /** One entry per depth; each opens the note in a new tab near the cursor, so the pane stays as it is. */
  private fillReadingDepth(menu: Menu): void {
    const depth = this.actions.readingDepth();
    const file = this.view.file;
    if (!depth || !file) return;
    const line = this.view.getMode() === "source" ? this.view.editor.getCursor().line : undefined;
    depth.levels.forEach(({ level, name, hint }) =>
      addEntry(menu, {
        title: `${name}: ${hint}`,
        icon: ["layers"],
        action: () => {
          const leaf = this.app.workspace.getLeaf("tab");
          depth.open(file, level, leaf, line).catch((error: unknown) => console.warn("Pagewise: Semantic Zoom could not open the note", error));
        },
      })
    );
  }

  destroy(): void {
    this.observer.disconnect();
    this.palette.close(false);
    this.openMenu?.menu.hide();
    this.el.remove();
    this.view.containerEl.classList.remove(HOST_CLASS);
  }

  /** The controls, grouped by purpose: block formats, inline formats, insertions. */
  private controlGroups(): Control[][] {
    const { app, view } = this;
    const command = (id: string) => () => executeCommand(app, id);
    return [
      [
        { label: "Headings", icon: ["heading"], overflowRank: 6, fill: (menu) => fillHeadingMenu(menu, view.editor) },
        { label: "Lists and blocks", icon: ["list"], overflowRank: 5, fill: (menu) => fillBlocksMenu(menu, app, view.editor) },
      ],
      [
        { label: "Bold", icon: ["bold"], overflowRank: 8, run: command("editor:toggle-bold") },
        { label: "Italic", icon: ["italic"], overflowRank: 7, run: command("editor:toggle-italics") },
        { label: "Highlight", icon: ["highlighter", "paintbrush"], overflowRank: 4, run: command("editor:toggle-highlight") },
      ],
      [
        { label: "Insert link", icon: ["link-2", "link"], overflowRank: 3, run: command("editor:insert-link") },
        { label: "Table", icon: ["table", "grid-3x3"], overflowRank: 2, fill: (menu) => fillTableMenu(menu, app, view.editor) },
        { label: "Insert image", icon: ["image-plus", "image"], overflowRank: 1, run: command("editor:attach-file") },
      ],
    ];
  }

  /**
   * Moves controls into the More menu until the rest fit on one line. Starts from
   * everything shown each time, so the result depends only on the available width.
   */
  private fit(): void {
    this.placed.forEach(({ button, group }) => {
      button.classList.remove(OVERFLOWED_CLASS);
      group.classList.remove(EMPTY_CLASS);
    });
    this.moreButton.classList.add(OVERFLOWED_CLASS);
    const overflowing = () => this.groupsEl.scrollWidth > this.groupsEl.clientWidth + 1;
    if (this.groupsEl.offsetParent !== null && overflowing()) {
      this.moreButton.classList.remove(OVERFLOWED_CLASS);
      const leaving = [...this.placed].sort((a, b) => a.control.overflowRank - b.control.overflowRank);
      for (const { button, group } of leaving) {
        if (!overflowing()) break;
        button.classList.add(OVERFLOWED_CLASS);
        if (Array.from(group.children).every((child) => child.classList.contains(OVERFLOWED_CLASS))) {
          group.classList.add(EMPTY_CLASS);
        }
      }
    }
    this.ensureTabStop();
  }

  /** Hidden controls in their usual order, one menu section per group. */
  private fillMore(menu: Menu): void {
    let lastGroup: HTMLElement | null = null;
    this.placed.forEach(({ control, button, group }) => {
      if (!button.classList.contains(OVERFLOWED_CLASS)) return;
      if (lastGroup && lastGroup !== group) menu.addSeparator();
      lastGroup = group;
      const action = control.fill
        ? // Opens the control's own menu once More has closed, at the same place.
          () => window.setTimeout(() => this.showMenu(this.moreButton, control.fill!, this.moreKeyboard), 0)
        : () => {
            this.activatePane();
            control.run!();
          };
      addEntry(menu, { title: control.label, icon: control.icon, action });
    });
  }

  private async toggleProperties(keyboard: boolean): Promise<void> {
    this.activatePane();
    await this.actions.toggleProperties(this.view);
    this.refreshState();
    if (keyboard) this.propertiesButton.focus();
  }

  private runCommand(run: () => void, keyboard: boolean): void {
    this.activatePane();
    run();
    // The edit happened in the note, so that is where the caret belongs next.
    if (keyboard || !this.editorHasFocus()) this.focusNote();
  }

  /**
   * Makes this pane the active one before anything acts on it. Obsidian's editor
   * commands act on the active editor, and the Properties view follows the active
   * note, so a click in another pane's toolbar must first bring that pane forward.
   * The editor keeps its selection while unfocused, so nothing is lost.
   */
  private activatePane(): void {
    const { workspace } = this.app;
    if (workspace.getActiveViewOfType(MarkdownView) !== this.view) {
      workspace.setActiveLeaf(this.view.leaf, { focus: true });
    }
  }

  private editorHasFocus(): boolean {
    const active = this.view.containerEl.ownerDocument.activeElement;
    return !!active && this.view.contentEl.contains(active);
  }

  private showMenu(button: HTMLElement, fill: (menu: Menu) => void, keyboard: boolean): void {
    this.activatePane();
    const menu = createMenu();
    fill(menu);
    menu.setParentElement(button);
    button.setAttribute("aria-expanded", "true");
    this.openMenu = { menu, button };
    whenHidden(menu, () => {
      button.setAttribute("aria-expanded", "false");
      if (this.openMenu?.menu === menu) this.openMenu = null;
      // After the menu's own click handling, return focus where the user left it,
      // unless an action moved it on purpose (a modal, a picker, another menu).
      window.setTimeout(() => this.restoreFocus(button, keyboard), 0);
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 2 }, button.ownerDocument);
  }

  private restoreFocus(button: HTMLElement, keyboard: boolean): void {
    if (this.openMenu || !this.el.isConnected) return;
    const active = this.el.ownerDocument.activeElement;
    if (active?.closest(".modal-container, .prompt, .menu")) return;
    if (keyboard) button.focus();
    else if (!this.editorHasFocus()) this.focusNote();
  }

  private focusNote(): void {
    if (this.view.getMode() === "source") this.view.editor.focus();
  }

  /** A button showing an icon and a small dropdown chevron; opens its menu below it. */
  private menuButton(label: string, icon: IconChoice, fill: (menu: Menu) => void, chevron = true): HTMLElement {
    const button = this.button(label, (keyboard) => {
      // A second press on an open menu's button closes it.
      if (this.openMenu?.button === button) {
        this.openMenu.menu.hide();
        return;
      }
      if (button === this.moreButton) this.moreKeyboard = keyboard;
      this.showMenu(button, fill, keyboard);
    });
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    if (chevron) {
      button.classList.add("has-menu");
      button.append(iconSpan(button, "pagewise-toolbar-icon", icon), iconSpan(button, "pagewise-toolbar-chevron", ["chevron-down"]));
    } else {
      setIcon(button, resolveIcon(icon));
    }
    return button;
  }

  private commandButton(label: string, icon: IconChoice, run: () => void): HTMLElement {
    const button = this.button(label, (keyboard) => this.runCommand(run, keyboard));
    setIcon(button, resolveIcon(icon));
    return button;
  }

  /** `keyboard` is true when Enter or Space pressed the button rather than a pointer. */
  private button(label: string, onPress: (keyboard: boolean) => void): HTMLElement {
    const button = this.el.ownerDocument.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-label", label);
    setTooltip(button, label, { placement: "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onPress(event.detail === 0);
    });
    return button;
  }

  // ---------- Keyboard: one tab stop, arrow keys move between visible controls ----------

  private visibleButtons(): HTMLElement[] {
    return this.toolbarButtons().filter((button) => button.offsetParent !== null);
  }

  /** The bar's own controls; the palette's swatches keep their own keyboard model. */
  private toolbarButtons(): HTMLElement[] {
    return Array.from(this.el.querySelectorAll<HTMLElement>(".pagewise-toolbar-button"));
  }

  private setTabStop(target: HTMLElement): void {
    if (!(target instanceof HTMLElement) || !target.matches(".pagewise-toolbar-button")) return;
    this.toolbarButtons().forEach((button) => (button.tabIndex = button === target ? 0 : -1));
  }

  /** Keeps the bar reachable by Tab when its current tab stop is hidden. */
  private ensureTabStop(): void {
    const visible = this.visibleButtons();
    if (!visible.some((button) => button.tabIndex === 0) && visible.length > 0) this.setTabStop(visible[0]);
  }

  private onKeydown(event: KeyboardEvent): void {
    const buttons = this.visibleButtons();
    const index = buttons.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowRight" ? buttons[(index + 1) % buttons.length]
      : event.key === "ArrowLeft" ? buttons[(index - 1 + buttons.length) % buttons.length]
      : event.key === "Home" ? buttons[0]
      : event.key === "End" ? buttons[buttons.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    this.setTabStop(next);
    next.focus();
  }
}

function iconSpan(owner: HTMLElement, className: string, icon: IconChoice): HTMLElement {
  const span = owner.ownerDocument.createElement("span");
  span.className = className;
  setIcon(span, resolveIcon(icon));
  return span;
}
