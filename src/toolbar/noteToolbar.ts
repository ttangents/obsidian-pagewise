import { MarkdownView, Menu as ObsidianMenu, setIcon, setTooltip, type App, type Menu } from "obsidian";
import type { BackgroundId } from "../appearance/backgrounds";
import { executeCommand, menuIsEmpty } from "../obsidianInternals";
import type { CommandButton } from "../settings";
import { markdownViews } from "../workspace";
import { fillBlocksMenu, fillHeadingMenu } from "./formatMenus";
import { registerCustomIcons, resolveIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS } from "./markdownActions";
import { BackgroundPalette } from "./backgroundPalette";
import { addEntry, createMenu, whenHidden } from "./menus";
import { fillTableMenu } from "./tableMenu";
import type { PagewiseToolbarContext, PagewiseToolbarItem } from "./extensionApi";
import type { ToolbarRegistry } from "./extensionRegistry";

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
  /** A command's name in the command palette, or null while no enabled plugin provides it. */
  commandName(commandId: string): string | null;
  runCommand(commandId: string): void;
  /** Opens Pagewise's settings, where the toolbar is customized. */
  openSettings(): void;
}

/** What the user and other plugins put on the toolbar beyond the built-in controls. */
export interface ToolbarConfig {
  /** Ids of hidden controls: built-in ones (BUILT_IN_CONTROLS) and extension item ids. */
  hidden: ReadonlySet<string>;
  commandButtons: readonly CommandButton[];
}

/** Every built-in control the user can hide, in toolbar order. */
export const BUILT_IN_CONTROLS: readonly { id: string; label: string }[] = [
  { id: "headings", label: "Headings" },
  { id: "lists", label: "Lists and blocks" },
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "highlight", label: "Highlight" },
  { id: "link", label: "Insert link" },
  { id: "table", label: "Table" },
  { id: "image", label: "Insert image" },
  { id: "background", label: "Background" },
  { id: "properties", label: "Properties" },
];

/** The icon a command button or extension item falls back to when its own is missing. */
const FALLBACK_ICON = "puzzle";

/**
 * One toolbar control. `overflowRank` is the order in which controls move into the
 * More menu as a pane narrows (lowest leaves first); they return in reverse order, so
 * a control is always either in its usual place or in More, never reshuffled.
 */
interface Control {
  id: string;
  label: string;
  icon: IconChoice;
  overflowRank: number;
  run?: () => void;
  fill?: (menu: Menu) => void;
  /** False hides the control on this pane for now; read on every refresh. */
  isAvailable?: () => boolean;
  /** Makes the control a toggle; true shows it pressed. */
  isActive?: () => boolean;
  /** A label that can change after the toolbar is built (a command's name). */
  currentLabel?: () => string;
}

/** Built-in formatting groups need an editor, so Reading view hides them. */
type GroupKind = "editing" | "commands" | "extensions";

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
  private config: ToolbarConfig = { hidden: new Set(), commandButtons: [] };
  private shouldShow: (view: MarkdownView) => boolean = () => false;

  constructor(
    private readonly app: App,
    private readonly actions: ToolbarActions,
    private readonly registry: ToolbarRegistry
  ) {
    registerCustomIcons(HEADING_LEVELS);
  }

  /** Applies the user's toolbar settings; rebuilds the bars only when they changed. */
  configure(config: ToolbarConfig): void {
    const key = (c: ToolbarConfig) => JSON.stringify([[...c.hidden].sort(), c.commandButtons]);
    if (key(config) === key(this.config)) return;
    this.config = config;
    this.rebuild();
  }

  /** Builds every bar afresh, after the settings or the registered extension items changed. */
  rebuild(): void {
    this.panes.forEach((pane) => pane.destroy());
    this.panes.clear();
    this.sync(this.shouldShow);
  }

  /** Gives each open Markdown pane a toolbar exactly when the predicate says so. */
  sync(shouldShow: (view: MarkdownView) => boolean): void {
    this.shouldShow = shouldShow;
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
      else this.panes.set(view, new PaneToolbar(this.app, view, this.actions, this.config, this.registry));
    });
    this.refreshState();
  }

  /** Re-reads state shown on the bars: pressed states and which controls are available. */
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
  private readonly palette: BackgroundPalette;
  private readonly placed: Placed[] = [];
  private readonly observer: ResizeObserver;
  private readonly modeObserver: MutationObserver;
  /** The menu this bar has open, if any, and the button it belongs to. */
  private openMenu: { menu: Menu; button: HTMLElement } | null = null;
  /** Whether the More menu was opened from the keyboard; menus it opens inherit that. */
  private moreKeyboard = false;

  constructor(
    private readonly app: App,
    private readonly view: MarkdownView,
    private readonly actions: ToolbarActions,
    private readonly config: ToolbarConfig,
    private readonly registry: ToolbarRegistry
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
    // Backstop for another plugin whose state changed without a refreshToolbar call.
    this.el.addEventListener("pointerenter", () => this.refreshState());
    this.el.addEventListener("contextmenu", (event) => this.showCustomizeMenu(event));

    this.groupsEl = this.el.createDiv({ cls: "pagewise-toolbar-groups" });
    this.controlGroups().forEach(({ kind, controls }) => {
      const visible = controls.filter((control) => !config.hidden.has(control.id));
      if (visible.length === 0) return;
      const group = this.groupsEl.createDiv({ cls: `pagewise-toolbar-group is-${kind}` });
      visible.forEach((control) => {
        const button = control.fill
          ? this.menuButton(control.label, control.icon, control.fill)
          : this.commandButton(control.label, control.icon, control.run!);
        if (control.isActive) button.setAttribute("aria-pressed", "false");
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
    const backgroundButton = this.button("Background", () => {
      if (this.palette.isOpen) this.palette.close(false);
      else this.palette.open();
    });
    backgroundButton.classList.add("pagewise-toolbar-background");
    backgroundButton.setAttribute("aria-haspopup", "dialog");
    backgroundButton.setAttribute("aria-expanded", "false");
    setIcon(backgroundButton, resolveIcon(["swatch-book", "palette"]));
    this.palette = new BackgroundPalette(this.el, backgroundButton, {
      current: () => this.actions.background(),
      choose: (id) => this.actions.setBackground(id),
    });
    const trailingControls: [string, HTMLElement][] = [
      ["background", backgroundButton],
      ["properties", this.propertiesButton],
    ];
    trailing.append(this.moreButton, ...trailingControls.filter(([id]) => !config.hidden.has(id)).map(([, button]) => button));

    this.attach();
    this.setTabStop(this.placed[0]?.button ?? this.propertiesButton);
    const Observer = doc.defaultView?.ResizeObserver ?? ResizeObserver;
    // The groups box changes size when the pane resizes.
    this.observer = new Observer(() => this.fit());
    this.observer.observe(this.groupsEl);
    // Switching between editing and Reading view changes which controls show.
    const Mutations = doc.defaultView?.MutationObserver ?? MutationObserver;
    this.modeObserver = new Mutations(() => this.fit());
    this.modeObserver.observe(view.containerEl, { attributes: true, attributeFilter: ["data-mode"] });
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
    // Availability can change the bar's contents, so the fit runs again.
    this.fit();
  }

  /** Re-reads what can change after the bar is built: availability, pressed state, labels. */
  private updateControls(): void {
    this.placed.forEach(({ control, button }) => {
      button.classList.toggle(UNAVAILABLE_CLASS, control.isAvailable ? !control.isAvailable() : false);
      if (control.isActive) button.setAttribute("aria-pressed", String(control.isActive()));
      const label = control.currentLabel?.();
      if (label && button.getAttribute("aria-label") !== label) {
        button.setAttribute("aria-label", label);
        setTooltip(button, label, { placement: "bottom" });
      }
    });
  }

  destroy(): void {
    this.observer.disconnect();
    this.modeObserver.disconnect();
    this.palette.close(false);
    this.openMenu?.menu.hide();
    this.el.remove();
    this.view.containerEl.classList.remove(HOST_CLASS);
  }

  /**
   * The controls, grouped by purpose: block formats, inline formats and insertions
   * (built in), then the user's command buttons, then items other plugins added.
   * The added groups leave for More first, right to left, then the built-in ranks.
   */
  private controlGroups(): { kind: GroupKind; controls: Control[] }[] {
    const { app, view } = this;
    const command = (id: string) => () => executeCommand(app, id);
    const commands = this.config.commandButtons;
    const extensions = this.registry.items();
    return [
      {
        kind: "editing",
        controls: [
          { id: "headings", label: "Headings", icon: ["heading"], overflowRank: 6, fill: (menu) => fillHeadingMenu(menu, view.editor) },
          { id: "lists", label: "Lists and blocks", icon: ["list"], overflowRank: 5, fill: (menu) => fillBlocksMenu(menu, app, view.editor) },
        ],
      },
      {
        kind: "editing",
        controls: [
          { id: "bold", label: "Bold", icon: ["bold"], overflowRank: 8, run: command("editor:toggle-bold") },
          { id: "italic", label: "Italic", icon: ["italic"], overflowRank: 7, run: command("editor:toggle-italics") },
          { id: "highlight", label: "Highlight", icon: ["highlighter", "paintbrush"], overflowRank: 4, run: command("editor:toggle-highlight") },
        ],
      },
      {
        kind: "editing",
        controls: [
          { id: "link", label: "Insert link", icon: ["link-2", "link"], overflowRank: 3, run: command("editor:insert-link") },
          { id: "table", label: "Table", icon: ["table", "grid-3x3"], overflowRank: 2, fill: (menu) => fillTableMenu(menu, app, view.editor) },
          { id: "image", label: "Insert image", icon: ["image-plus", "image"], overflowRank: 1, run: command("editor:attach-file") },
        ],
      },
      {
        kind: "commands",
        controls: commands.map((button, index) => this.commandControl(button, -1000 + (commands.length - 1 - index))),
      },
      {
        kind: "extensions",
        controls: extensions.map((item, index) => this.extensionControl(item, -2000 + (extensions.length - 1 - index))),
      },
    ];
  }

  /** A command button the user added. Its command may come and go with its plugin. */
  private commandControl({ commandId, icon }: CommandButton, overflowRank: number): Control {
    const label = () => this.actions.commandName(commandId) ?? commandId;
    return {
      id: `command:${commandId}`,
      label: label(),
      icon: [icon, FALLBACK_ICON],
      overflowRank,
      run: () => this.actions.runCommand(commandId),
      isAvailable: () => this.actions.commandName(commandId) !== null,
      currentLabel: label,
    };
  }

  /** An item another plugin registered. Every call into it goes through the registry's guard. */
  private extensionControl(item: PagewiseToolbarItem, overflowRank: number): Control {
    const { registry, view } = this;
    const context = (): PagewiseToolbarContext => ({
      view,
      file: view.file,
      editor: view.editor,
      mode: view.getMode() === "preview" ? "preview" : "source",
    });
    const { onClick, menu, isActive, isVisible } = item;
    return {
      id: item.id,
      label: item.label,
      icon: [item.icon, FALLBACK_ICON],
      overflowRank,
      run: onClick && (() => registry.call(item.id, "onClick", () => onClick(context()), undefined)),
      fill: menu && ((target) => registry.call(item.id, "menu", () => menu(target, context()), undefined)),
      isAvailable: () =>
        (item.readingView || context().mode === "source") &&
        registry.call(item.id, "isVisible", () => (isVisible ? isVisible(context()) !== false : true), false),
      isActive: isActive && (() => registry.call(item.id, "isActive", () => isActive(context()) === true, false)),
    };
  }

  /** Right-click on the bar offers its settings. */
  private showCustomizeMenu(event: MouseEvent): void {
    event.preventDefault();
    const menu = new ObsidianMenu();
    menu.addItem((item) => item.setTitle("Customize toolbar…").setIcon("settings").onClick(() => this.actions.openSettings()));
    menu.showAtMouseEvent(event);
  }

  /**
   * Moves controls into the More menu until the rest fit on one line. Starts from
   * everything shown each time, so the result depends only on the available width.
   */
  private fit(): void {
    this.updateControls();
    this.placed.forEach(({ button, group }) => {
      button.classList.remove(OVERFLOWED_CLASS);
      group.classList.remove(EMPTY_CLASS);
    });
    // A group whose controls are all unavailable takes no space at all.
    this.placed.forEach(({ group }) => group.classList.toggle(EMPTY_CLASS, groupIsEmpty(group)));
    this.moreButton.classList.add(OVERFLOWED_CLASS);
    const overflowing = () => this.groupsEl.scrollWidth > this.groupsEl.clientWidth + 1;
    if (this.groupsEl.offsetParent !== null && overflowing()) {
      this.moreButton.classList.remove(OVERFLOWED_CLASS);
      const leaving = [...this.placed].sort((a, b) => a.control.overflowRank - b.control.overflowRank);
      for (const { button, group } of leaving) {
        if (!overflowing()) break;
        // A control already hidden (unavailable, or in a group Reading view hides) frees no space.
        if (button.offsetParent === null) continue;
        button.classList.add(OVERFLOWED_CLASS);
        if (groupIsEmpty(group)) group.classList.add(EMPTY_CLASS);
      }
    }
    this.ensureTabStop();
  }

  /** Hidden controls in their usual order, one menu section per group. */
  private fillMore(menu: Menu): void {
    let lastGroup: HTMLElement | null = null;
    this.placed.forEach(({ control, button, group }) => {
      if (!button.classList.contains(OVERFLOWED_CLASS) || button.classList.contains(UNAVAILABLE_CLASS)) return;
      if (lastGroup && lastGroup !== group) menu.addSeparator();
      lastGroup = group;
      const action = control.fill
        ? // Opens the control's own menu once More has closed, at the same place.
          () => window.setTimeout(() => this.showMenu(this.moreButton, control.fill!, this.moreKeyboard), 0)
        : () => {
            this.activatePane();
            control.run!();
          };
      const entry = addEntry(menu, { title: control.currentLabel?.() ?? control.label, icon: control.icon, action });
      if (control.isActive) entry.setChecked(control.isActive());
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
    this.updateControls();
    // The edit happened in the note, so that is where the caret belongs next, unless
    // the action moved on: opened a modal or menu, or made another pane active.
    window.setTimeout(() => {
      if (!this.el.isConnected || this.app.workspace.getActiveViewOfType(MarkdownView) !== this.view) return;
      if (this.el.ownerDocument.activeElement?.closest(".modal-container, .prompt, .menu")) return;
      if (keyboard || !this.editorHasFocus()) this.focusNote();
    }, 0);
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
    // An item that added nothing (or failed) opens no menu, rather than an empty one.
    if (menuIsEmpty(menu)) return;
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

/** True when none of a group's controls currently shows: all unavailable or in More. */
function groupIsEmpty(group: HTMLElement): boolean {
  return Array.from(group.children).every(
    (child) => child.classList.contains(OVERFLOWED_CLASS) || child.classList.contains(UNAVAILABLE_CLASS)
  );
}
