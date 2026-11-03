import { MarkdownView, Menu as ObsidianMenu, setIcon, setTooltip, type App, type Editor, type Menu } from "obsidian";
import type { BackgroundId } from "../appearance/backgrounds";
import { menuIsEmpty, navigationDepth } from "../obsidianInternals";
import type { CommandButton } from "../settings";
import { markdownViews } from "../workspace";
import { DOM } from "../obsidianDom";
import { editingGroups, NAVIGATION_CONTROLS, resolveControl, TRAILING_CONTROLS, type ControlMenu } from "./controls";
import { fillBlocksMenu, fillHeadingMenu, fillHighlightMenu } from "./formatMenus";
import { registerCustomIcons, resolveIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS } from "./markdownActions";
import { BackgroundPalette } from "./backgroundPalette";
import { addEntry, createMenu, whenHidden, type CommandRunner } from "./menus";
import { DISABLED_CLASS, fitToWidth, OVERFLOWED_CLASS, UNAVAILABLE_CLASS } from "./overflow";
import { RovingTabStop } from "./rovingFocus";
import { fillTableMenu } from "./tableMenu";
import { badgeLabel, paintBadge } from "./badge";
import { normalizeBadge, type PagewiseToolbarBadge, type PagewiseToolbarContext, type PagewiseToolbarItem } from "./extensionApi";
import type { ToolbarRegistry } from "./extensionRegistry";

const TOOLBAR_CLASS = "pagewise-toolbar";
const HOST_CLASS = "pagewise-has-toolbar";
/** On a pane whose bar shows Back or Forward; the stylesheet then hides Obsidian's own pair. */
const NAVIGATION_HOST_CLASS = "pagewise-has-navigation";
const BUTTON_CLASS = "pagewise-toolbar-button";

/** What the toolbar asks of its owner: commands (the only way it runs one), Properties, and the background. */
export interface ToolbarActions extends CommandRunner {
  /** Shows or hides the Properties view for the pane's note. The pane is already active. */
  toggleProperties(view: MarkdownView): Promise<void>;
  /** True while a visible Properties view shows the pane's note. */
  propertiesShown(view: MarkdownView): boolean;
  /** The canvas background, shared by every paginated pane. */
  background(): BackgroundId;
  setBackground(id: BackgroundId): void;
  /** A command's name in the command palette, or null while no enabled plugin provides it. */
  commandName(commandId: string): string | null;
  /** Opens Pagewise's settings, where the toolbar is customized. */
  openSettings(): void;
}

/** What the user and other plugins put on the toolbar beyond the built-in controls. */
export interface ToolbarConfig {
  /** Ids of hidden controls: built-in ones (BUILT_IN_CONTROLS in controls.ts) and extension item ids. */
  hidden: ReadonlySet<string>;
  commandButtons: readonly CommandButton[];
}

/** The contents of the editing controls' menus. */
const MENUS: Record<ControlMenu, (menu: Menu, commands: CommandRunner, editor: Editor) => void> = {
  headings: (menu, _commands, editor) => fillHeadingMenu(menu, editor),
  blocks: fillBlocksMenu,
  table: fillTableMenu,
  highlight: (menu, commands) => fillHighlightMenu(menu, commands),
};

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
  /** False shows the control dimmed and makes it do nothing, as Back does with no history. */
  isEnabled?: () => boolean;
  /** Makes the control a toggle; true shows it pressed. */
  isActive?: () => boolean;
  /** A label that can change after the toolbar is built (a command's name). */
  currentLabel?: () => string;
  /** An extension item's badge on this pane; read on every refresh. */
  badge?: () => PagewiseToolbarBadge | null;
}

/** Built-in formatting groups need an editor, so Reading view hides them. */
type GroupKind = "navigation" | "editing" | "commands" | "extensions";

/**
 * The bar's sections, left to right, which a thin divider sets apart: moving through
 * history, formatting the note, and what the user or other plugins added. Groups
 * within a section are set apart by space alone.
 */
const SECTION_OF: Record<GroupKind, string> = {
  navigation: "navigation",
  editing: "formatting",
  commands: "added",
  extensions: "added",
};

interface Placed {
  control: Control;
  button: HTMLElement;
  group: HTMLElement;
}

/**
 * The document toolbar: a fixed horizontal bar at the top of a Markdown pane,
 * between Obsidian's view header and the scrolling canvas, so it never overlaps the
 * sheet or the find bar and takes no part in pagination. It shows on paginated
 * panes, or on every Markdown pane when the user chooses "All notes" (D5).
 * NoteToolbar owns one PaneToolbar per pane that shows the bar and nothing else.
 */
export class NoteToolbar {
  private readonly panes = new Map<MarkdownView, PaneToolbar>();
  private config: ToolbarConfig = { hidden: new Set(), commandButtons: [] };
  private shouldShow: (view: MarkdownView) => boolean = () => false;
  private readonly removeIcons: () => void;

  constructor(
    private readonly app: App,
    private readonly actions: ToolbarActions,
    private readonly registry: ToolbarRegistry
  ) {
    this.removeIcons = registerCustomIcons(HEADING_LEVELS);
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

  /** Removes every bar and the icons Pagewise registered. */
  dispose(): void {
    this.panes.forEach((pane) => pane.destroy());
    this.panes.clear();
    this.removeIcons();
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
  private readonly tabStop: RovingTabStop;
  private readonly observer: ResizeObserver;
  private readonly modeObserver: MutationObserver;
  /** The menu this bar has open, if any, and the button it belongs to. */
  private openMenu: { menu: Menu; button: HTMLElement } | null = null;
  /** Whether the More menu was opened from the keyboard; menus it opens inherit that. */
  private moreKeyboard = false;
  /** Whether the bar shows Back or Forward, so Obsidian's own pair can give way. */
  private readonly showsNavigation: boolean;

  constructor(
    private readonly app: App,
    private readonly view: MarkdownView,
    private readonly actions: ToolbarActions,
    private readonly config: ToolbarConfig,
    private readonly registry: ToolbarRegistry
  ) {
    const doc = view.containerEl.ownerDocument;
    // Created in the pane, then attach() moves it between the view header and the content.
    this.el = view.containerEl.createDiv({ cls: TOOLBAR_CLASS, attr: { role: "toolbar", "aria-label": "Document toolbar" } });
    this.tabStop = new RovingTabStop(this.el, `.${BUTTON_CLASS}`);
    // A pointer press on the bar must not take focus or the selection from the editor.
    this.el.addEventListener("mousedown", (event) => event.preventDefault());
    this.el.addEventListener("keydown", (event) => this.tabStop.onKeydown(event));
    this.el.addEventListener("focusin", (event) => this.tabStop.set(event.target));
    // Backstop for another plugin whose state changed without a refreshToolbar call.
    this.el.addEventListener("pointerenter", () => this.refreshState());
    this.el.addEventListener("contextmenu", (event) => this.showCustomizeMenu(event));

    this.groupsEl = this.el.createDiv({ cls: "pagewise-toolbar-groups" });
    const sections = new Map<string, HTMLElement>();
    this.controlGroups().forEach(({ kind, controls }) => {
      const visible = controls.filter((control) => !config.hidden.has(control.id));
      if (visible.length === 0) return;
      const name = SECTION_OF[kind];
      let section = sections.get(name);
      if (!section) {
        section = this.groupsEl.createDiv({ cls: `pagewise-toolbar-section is-${name}` });
        sections.set(name, section);
      }
      const group = section.createDiv({ cls: `pagewise-toolbar-group is-${kind}` });
      visible.forEach((control) => {
        const button = control.fill
          ? this.menuButton(control.label, control.icon, control.fill)
          : this.commandButton(control.label, control.icon, control.run!);
        if (control.isActive) button.setAttribute("aria-pressed", "false");
        group.append(button);
        this.placed.push({ control, button, group });
      });
    });
    this.showsNavigation = sections.has("navigation");

    const trailing = this.el.createDiv({ cls: "pagewise-toolbar-trailing" });
    this.moreButton = this.menuButton("More tools", ["ellipsis", "more-horizontal"], (menu) => this.fillMore(menu), false);
    this.moreButton.classList.add("pagewise-toolbar-more", OVERFLOWED_CLASS);
    trailing.append(this.moreButton);
    const trailingButtons = new Map(
      TRAILING_CONTROLS.map(({ id, label, icon }) => {
        const press = id === "properties" ? (keyboard: boolean) => void this.toggleProperties(keyboard) : () => this.togglePalette();
        const button = this.button(label, press);
        button.classList.add(`pagewise-toolbar-${id}`);
        setIcon(button, resolveIcon(icon));
        if (config.hidden.has(id)) button.detach();
        else trailing.append(button);
        return [id, button] as const;
      })
    );
    this.propertiesButton = trailingButtons.get("properties")!;
    this.propertiesButton.setAttribute("aria-pressed", "false");
    const backgroundButton = trailingButtons.get("background")!;
    backgroundButton.setAttribute("aria-haspopup", "dialog");
    backgroundButton.setAttribute("aria-expanded", "false");
    this.palette = new BackgroundPalette(this.el, backgroundButton, {
      current: () => this.actions.background(),
      choose: (id) => this.actions.setBackground(id),
    });

    this.attach();
    this.tabStop.set(this.placed[0]?.button ?? this.propertiesButton);
    const Observer = doc.defaultView?.ResizeObserver ?? ResizeObserver;
    // The groups box changes size when the pane resizes.
    this.observer = new Observer(() => this.fit());
    this.observer.observe(this.groupsEl);
    // Switching between editing and Reading view changes which controls show.
    const Mutations = doc.defaultView?.MutationObserver ?? MutationObserver;
    this.modeObserver = new Mutations(() => this.fit());
    this.modeObserver.observe(view.containerEl, { attributes: true, attributeFilter: [DOM.viewModeAttribute] });
  }

  /** Places the bar between the view header and the content; idempotent. */
  attach(): void {
    const container = this.view.containerEl;
    container.classList.add(HOST_CLASS);
    container.classList.toggle(NAVIGATION_HOST_CLASS, this.showsNavigation);
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
      if (control.isEnabled) {
        const enabled = control.isEnabled();
        button.classList.toggle(DISABLED_CLASS, !enabled);
        button.setAttribute("aria-disabled", String(!enabled));
      }
      if (control.isActive) button.setAttribute("aria-pressed", String(control.isActive()));
      let label = control.currentLabel?.();
      if (control.badge) {
        const badge = control.badge();
        paintBadge(button, badge);
        label = badgeLabel(label ?? control.label, badge);
      }
      if (label && button.getAttribute("aria-label") !== label) {
        button.setAttribute("aria-label", label);
        setTooltip(button, label, { placement: "bottom" });
      }
    });
  }

  private togglePalette(): void {
    if (this.palette.isOpen) this.palette.close(false);
    else this.palette.open();
  }

  destroy(): void {
    this.observer.disconnect();
    this.modeObserver.disconnect();
    this.palette.close(false);
    this.openMenu?.menu.hide();
    this.el.remove();
    this.view.containerEl.classList.remove(HOST_CLASS, NAVIGATION_HOST_CLASS);
  }

  /**
   * The controls, grouped by purpose: Back and Forward, then block formats, inline
   * formats and insertions (built in), then the user's command buttons, then items
   * other plugins added. The added groups leave for More first, right to left, then
   * the built-in ranks; Back and Forward leave last.
   */
  private controlGroups(): { kind: GroupKind; controls: Control[] }[] {
    const { actions, view } = this;
    const commands = this.config.commandButtons;
    const extensions = this.registry.items();
    const editing = editingGroups().map((group) => ({
      kind: "editing" as const,
      controls: group.map((control): Control => {
        const { command, menu } = resolveControl(control, (id) => actions.hasCommand(id));
        return {
          id: control.id,
          label: control.label,
          icon: control.icon,
          overflowRank: control.overflowRank,
          run: command === undefined ? undefined : () => actions.runCommand(command),
          fill: menu === undefined ? undefined : (target: Menu) => MENUS[menu](target, actions, view.editor),
        };
      }),
    }));
    const navigation = {
      kind: "navigation" as const,
      controls: NAVIGATION_CONTROLS.map(({ id, label, icon, overflowRank, command }): Control => ({
        id,
        label,
        icon,
        overflowRank,
        run: () => actions.runCommand(command),
        isEnabled: () => {
          const depth = navigationDepth(view.leaf);
          return depth === null || (id === "back" ? depth.back : depth.forward) > 0;
        },
      })),
    };
    return [
      navigation,
      ...editing,
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
    const { onClick, menu, isActive, isVisible, badge } = item;
    return {
      id: item.id,
      label: item.label,
      icon: [item.icon, FALLBACK_ICON],
      overflowRank,
      run: onClick && (() => void registry.call(item.id, "onClick", () => onClick(context()), undefined, true)),
      fill: menu && ((target) => registry.call(item.id, "menu", () => menu(target, context()), undefined)),
      isAvailable: () =>
        (item.readingView || context().mode === "source") &&
        registry.call(item.id, "isVisible", () => (isVisible ? isVisible(context()) !== false : true), false),
      isActive: isActive && (() => registry.call(item.id, "isActive", () => isActive(context()) === true, false)),
      badge: badge && (() => registry.call(item.id, "badge", () => normalizeBadge(badge(context())), null)),
    };
  }

  /** Right-click on the bar offers its settings. */
  private showCustomizeMenu(event: MouseEvent): void {
    event.preventDefault();
    const menu = new ObsidianMenu();
    menu.addItem((item) => item.setTitle("Customize toolbar…").setIcon("settings").onClick(() => this.actions.openSettings()));
    menu.showAtMouseEvent(event);
  }

  /** Moves controls into More until the rest fit, then keeps the bar reachable by Tab. */
  private fit(): void {
    this.updateControls();
    fitToWidth(
      this.groupsEl,
      this.placed.map(({ control, button, group }) => ({ button, group, overflowRank: control.overflowRank })),
      this.moreButton
    );
    this.tabStop.ensure();
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
          () => this.el.win.setTimeout(() => this.showMenu(this.moreButton, control.fill!, this.moreKeyboard), 0)
        : () => {
            this.activatePane();
            control.run!();
          };
      const entry = addEntry(menu, { title: control.currentLabel?.() ?? control.label, icon: control.icon, action });
      if (control.isActive) entry.setChecked(control.isActive());
      if (button.classList.contains(DISABLED_CLASS)) entry.setDisabled(true);
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
    this.el.win.setTimeout(() => {
      if (!this.el.isConnected || this.app.workspace.getActiveViewOfType(MarkdownView) !== this.view) return;
      if (this.el.ownerDocument.activeElement?.closest(DOM.focusOwners)) return;
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
      this.el.win.setTimeout(() => this.restoreFocus(button, keyboard), 0);
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 2 }, button.ownerDocument);
  }

  private restoreFocus(button: HTMLElement, keyboard: boolean): void {
    if (this.openMenu || !this.el.isConnected) return;
    const active = this.el.ownerDocument.activeElement;
    if (active?.closest(DOM.focusOwners)) return;
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
    const button = this.button(label, (keyboard) => {
      // A dimmed control, such as Back with no history, does nothing.
      if (!button.classList.contains(DISABLED_CLASS)) this.runCommand(run, keyboard);
    });
    setIcon(button, resolveIcon(icon));
    return button;
  }

  /** `keyboard` is true when Enter or Space pressed the button rather than a pointer. */
  private button(label: string, onPress: (keyboard: boolean) => void): HTMLElement {
    // Created in the bar's own window; the caller moves it into its group.
    const button = this.el.createEl("button", { cls: `${BUTTON_CLASS} clickable-icon`, attr: { type: "button", "aria-label": label } });
    button.tabIndex = -1;
    setTooltip(button, label, { placement: "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onPress(event.detail === 0);
    });
    return button;
  }
}

function iconSpan(owner: HTMLElement, className: string, icon: IconChoice): HTMLElement {
  const span = owner.createSpan({ cls: className });
  setIcon(span, resolveIcon(icon));
  return span;
}
