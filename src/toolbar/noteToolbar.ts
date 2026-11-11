import { MarkdownView, Menu as ObsidianMenu, setIcon, setTooltip, type App, type Editor, type Menu } from "obsidian";
import type { Background } from "../appearance/backgrounds";
import type { PartnerStatus } from "../partners/homeCards";
import { menuIsEmpty, navigationDepth } from "../obsidianInternals";
import type { CommandButton } from "../settings";
import { markdownViews } from "../workspace";
import { DOM } from "../obsidianDom";
import { addedRank, editingGroups, NAVIGATION_CONTROLS, resolveControl, TRAILING_CONTROLS, type ControlMenu } from "./controls";
import { fillBlocksMenu, fillHeadingMenu, fillHighlightMenu } from "./formatMenus";
import { registerCustomIcons, resolveIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS } from "./markdownActions";
import { BackgroundPalette } from "./backgroundPalette";
import { addEntry, createMenu, whenHidden, type CommandRunner } from "./menus";
import { DISABLED_CLASS, fitToWidth, OVERFLOWED_CLASS, UNAVAILABLE_CLASS } from "./overflow";
import { focusDestination, RovingTabStop } from "./rovingFocus";
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
  /** The chosen canvas background's id, shared by every paginated pane. */
  background(): string;
  setBackground(id: string): void;
  /** The patterns Home Cards lends; the Background button shows only while Home Cards is installed (D29). */
  backgrounds(): { status: PartnerStatus; backgrounds: readonly Background[] };
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

/**
 * Built-in formatting groups need an editor, so Reading view hides them. "added"
 * holds the user's command buttons and then other plugins' items in one group:
 * where a control came from is no reason to set it apart on the bar.
 */
type GroupKind = "navigation" | "editing" | "added";

/**
 * The bar's sections, left to right, which a thin divider sets apart: moving through
 * history, formatting the note, and what the user or other plugins added. Groups
 * within a section are set apart by space alone.
 */
const SECTION_OF: Record<GroupKind, string> = {
  navigation: "navigation",
  editing: "formatting",
  added: "added",
};

interface Placed {
  control: Control;
  button: HTMLElement;
  /** Null for the trailing controls, which sit after More rather than in a group. */
  group: HTMLElement | null;
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
    // A partner loading or unloading rebuilds every bar; the control that had focus keeps it.
    const focused = new Map<MarkdownView, string>();
    this.panes.forEach((pane, view) => {
      const id = pane.focusedControlId();
      if (id !== null) focused.set(view, id);
      pane.destroy();
    });
    this.panes.clear();
    this.sync(this.shouldShow);
    focused.forEach((id, view) => this.panes.get(view)?.focusControl(id));
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
  private readonly trailingEl: HTMLElement;
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
  /**
   * A bar button that lost focus because it stopped showing (the browser moves focus
   * to the body without a destination). The next fit hands focus on from it.
   */
  private blurredByHiding: HTMLElement | null = null;
  /** When blurredByHiding was set; it counts only for a fit that follows within a moment. */
  private blurredAt = 0;

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
    this.el.addEventListener("focusin", (event) => {
      this.blurredByHiding = null;
      this.tabStop.set(event.target);
    });
    this.el.addEventListener("focusout", (event) => {
      const target = event.target as HTMLElement;
      const hidden = !target.isConnected || target.offsetParent === null;
      this.blurredByHiding = event.relatedTarget === null && hidden && target.matches(`.${BUTTON_CLASS}`) ? target : null;
      this.blurredAt = event.timeStamp;
    });
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
    this.trailingEl = trailing;
    this.moreButton = this.menuButton("More tools", ["ellipsis", "more-horizontal"], (menu) => this.fillMore(menu), false);
    this.moreButton.classList.add("pagewise-toolbar-more", OVERFLOWED_CLASS);
    trailing.append(this.moreButton);
    const trailingButtons = new Map(
      TRAILING_CONTROLS.map(({ id, label, icon, overflowRank }) => {
        const press = id === "properties" ? (keyboard: boolean) => void this.toggleProperties(keyboard) : () => this.togglePalette();
        const button = this.button(label, press);
        button.classList.add(`pagewise-toolbar-${id}`);
        setIcon(button, resolveIcon(icon));
        // Background shows only while Home Cards is installed, which lends the patterns (D29).
        const unavailable = id === "background" && actions.backgrounds().status === "absent";
        if (config.hidden.has(id) || unavailable) button.detach();
        else {
          trailing.append(button);
          const control: Control =
            id === "properties"
              ? { id, label, icon, overflowRank, run: () => void this.toggleProperties(this.moreKeyboard), isActive: () => this.actions.propertiesShown(this.view) }
              : {
                  id,
                  label,
                  icon,
                  overflowRank,
                  run: () => this.togglePalette(),
                  // The pattern paints only the paginated canvas, so Background shows only there.
                  isAvailable: () => this.view.containerEl.classList.contains("pagewise-active"),
                };
          this.placed.push({ control, button, group: null });
        }
        return [id, button] as const;
      })
    );
    this.propertiesButton = trailingButtons.get("properties")!;
    this.propertiesButton.setAttribute("aria-pressed", "false");
    const backgroundButton = trailingButtons.get("background")!;
    backgroundButton.setAttribute("aria-haspopup", "dialog");
    backgroundButton.setAttribute("aria-expanded", "false");
    this.palette = new BackgroundPalette(
      this.el,
      backgroundButton,
      {
        current: () => this.actions.background(),
        choose: (id) => this.actions.setBackground(id),
        offered: () => this.actions.backgrounds(),
      },
      // Opened from More, the palette returns focus to More, since Background is not on the bar.
      () => this.focusShowing(backgroundButton)
    );

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
   * formats and insertions (built in), then what the user and other plugins added.
   * The order they leave for More in is OVERFLOW_RANK in controls.ts.
   */
  private controlGroups(): { kind: GroupKind; controls: Control[] }[] {
    const { actions, view } = this;
    const commands = this.config.commandButtons;
    const extensions = this.registry.items();
    const added = commands.length + extensions.length;
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
        kind: "added",
        controls: [
          ...commands.map((button, index) => this.commandControl(button, addedRank(index, added))),
          ...extensions.map((item, index) => this.extensionControl(item, addedRank(commands.length + index, added))),
        ],
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

  /**
   * Moves controls into More until the rest fit, then keeps the bar reachable by Tab.
   * The browser drops focus from a button the moment it stops showing, so the
   * focused control is read before the fit and focus handed on after it.
   */
  private fit(): void {
    const focused = this.focusedButton();
    this.updateControls();
    fitToWidth(
      { bar: this.el, groups: this.groupsEl, trailing: this.trailingEl, more: this.moreButton },
      this.placed.map(({ control, button, group }) => ({ button, group, overflowRank: control.overflowRank }))
    );
    // A menu whose button just left the bar closes; its hide handler returns focus.
    if (this.openMenu && !shows(this.openMenu.button)) this.openMenu.menu.hide();
    if (focused && !shows(focused)) this.handOnFocus(focused);
    // More is hidden for a moment at the start of every fit; a browser that blurs it then gets focus back.
    else if (focused && this.focusIsNowhere()) focused.focus({ preventScroll: true });
    this.blurredByHiding = null;
    this.tabStop.ensure();
  }

  /** The bar button that has focus, or that just lost it by ceasing to show; null when focus is elsewhere. */
  private focusedButton(): HTMLElement | null {
    const active = this.el.ownerDocument.activeElement;
    // instanceOf checks against the pane's own window, which differs in a pop-out.
    if (active?.instanceOf(HTMLElement) && this.el.contains(active) && active.matches(`.${BUTTON_CLASS}`)) return active;
    // A blur older than half a second was not caused by the change this fit answers.
    const recent = this.el.win.performance.now() - this.blurredAt < 500;
    return this.focusIsNowhere() && recent ? this.blurredByHiding : null;
  }

  /** True when focus sits on the body, as after the browser drops it from a hidden button. */
  private focusIsNowhere(): boolean {
    const active = this.el.ownerDocument.activeElement;
    return active === null || active === this.el.ownerDocument.body;
  }

  /** Moves focus from a bar button that no longer shows to where focusDestination says. */
  private handOnFocus(from: HTMLElement): void {
    const active = this.el.ownerDocument.activeElement;
    // Focus that already moved somewhere real (the editor, a modal) stays there.
    if (active !== from && !this.focusIsNowhere()) return;
    const destination = this.destination(from);
    if (destination) {
      this.tabStop.set(destination);
      destination.focus();
    } else {
      this.focusNote();
    }
  }

  private destination(from: HTMLElement): HTMLElement | null {
    const buttons = Array.from(this.el.querySelectorAll<HTMLElement>(`.${BUTTON_CLASS}`));
    return focusDestination(buttons, from, {
      isShown: shows,
      movedToMore: (button) => button.classList.contains(OVERFLOWED_CLASS),
      more: this.moreButton,
    });
  }

  /** Focuses the button when it shows, otherwise where its focus would be handed on. */
  private focusShowing(button: HTMLElement): void {
    const target = shows(button) ? button : this.destination(button);
    if (target) {
      this.tabStop.set(target);
      target.focus();
    }
  }

  /** The id of the control that has focus, for a rebuild to restore; null when focus is elsewhere. */
  focusedControlId(): string | null {
    const focused = this.focusedButton();
    if (!focused) return null;
    if (focused === this.moreButton) return "more";
    return this.placed.find(({ button }) => button === focused)?.control.id ?? null;
  }

  /** Focuses a control by id after a rebuild: on the bar, in More, or the bar's tab stop if it is gone. */
  focusControl(id: string): void {
    const button = id === "more" ? this.moreButton : this.placed.find(({ control }) => control.id === id)?.button;
    if (button) {
      this.focusShowing(button);
      return;
    }
    this.tabStop.ensure();
    const stop = this.el.querySelector<HTMLElement>(`.${BUTTON_CLASS}[tabindex="0"]`);
    if (stop) this.focusShowing(stop);
  }

  /** Hidden controls in their usual order, one menu section per group. */
  private fillMore(menu: Menu): void {
    let lastGroup: HTMLElement | null = null;
    this.placed.forEach(({ control, button, group }) => {
      if (!button.classList.contains(OVERFLOWED_CLASS) || button.classList.contains(UNAVAILABLE_CLASS)) return;
      // Availability can change between fits (a pane stops being paginated), so it is read again here.
      if (control.isAvailable && !control.isAvailable()) return;
      if (lastGroup && lastGroup !== group) menu.addSeparator();
      lastGroup = group;
      const action = control.fill
        ? // Opens the control's own menu once More has closed, at the same place.
          () => this.el.win.setTimeout(() => this.showMenu(this.moreButton, control.fill!, this.moreKeyboard, button), 0)
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
    if (keyboard) this.focusShowing(this.propertiesButton);
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

  /**
   * Opens a menu below its button. `origin` is the control whose menu it is, when
   * More opened it on that control's behalf; focus returns there if it is back on the bar.
   */
  private showMenu(button: HTMLElement, fill: (menu: Menu) => void, keyboard: boolean, origin: HTMLElement = button): void {
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
      this.el.win.setTimeout(() => this.restoreFocus(button, origin, keyboard), 0);
    });
    const rect = button.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 2 }, button.ownerDocument);
  }

  private restoreFocus(button: HTMLElement, origin: HTMLElement, keyboard: boolean): void {
    if (this.openMenu || !this.el.isConnected) return;
    const active = this.el.ownerDocument.activeElement;
    if (active?.closest(DOM.focusOwners)) return;
    // The menu's button may have left the bar while the menu was open.
    if (keyboard) this.focusShowing(shows(button) || !shows(origin) ? button : origin);
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

/** True while the element takes part in layout: not hidden, overflowed or detached. */
function shows(el: HTMLElement): boolean {
  return el.isConnected && el.offsetParent !== null;
}

function iconSpan(owner: HTMLElement, className: string, icon: IconChoice): HTMLElement {
  const span = owner.createSpan({ cls: className });
  setIcon(span, resolveIcon(icon));
  return span;
}
