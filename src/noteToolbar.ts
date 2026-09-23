import { App, MarkdownView, Menu, MenuItem, addIcon, getIcon, setIcon, setTooltip } from "obsidian";
import { applyTableEdit, deleteTable, locateTable } from "./tableEditor";
import type { ToolbarDirection } from "./settings";
import {
  deleteColumn,
  deleteRow,
  duplicateRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  setAlignment,
  sortRows,
  transpose,
  type ColumnAlignment,
} from "./tableModel";

const TOOLBAR_CLASS = "pagewise-toolbar";
const FORMAT_GROUP_CLASS = "pagewise-toolbar-format";
const HOST_CLASS = "pagewise-has-toolbar";
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const HEADING_ICON_PREFIX = "pagewise-heading-";
const SEPARATOR_ICON = "pagewise-separator";
const EXPANDED_CLASS = "is-expanded";
const VERTICAL_CLASS = "is-vertical";
const COLLAPSE_DELAY_MS = 5000;
/** The pane's two content views; only the one for the current mode is displayed. */
const CONTENT_VIEW_SELECTOR = ":scope > .markdown-source-view, :scope > .markdown-reading-view";
/** Obsidian's in-note find bar (Ctrl/Cmd-F); its exact place in the pane varies by version and theme. */
const FIND_BAR_SELECTOR = ".document-search-container";
const TOOLBAR_TOP_INSET_PX = 10;

/** The observers that keep one pane's toolbar anchored, released together. */
interface HostWatch {
  disconnect(): void;
}

/** Obsidian's Menu and MenuItem expose their DOM privately; typed here, guarded at use. */
interface MenuWithDom extends Menu {
  dom?: HTMLElement;
}
interface MenuItemWithDom extends MenuItem {
  dom?: HTMLElement;
}

/** Undocumented App surfaces the toolbar relies on, guarded at every call site. */
interface AppWithCommands extends App {
  commands: { executeCommandById(id: string): void };
  hotkeyManager?: { printHotkeyForCommand?(id: string): string };
}

export interface ToolbarActions {
  toggleProperties(): void;
}

interface BlockMenuItem {
  title: string;
  /** Icon candidates, newest Lucide name first; resolveIcon picks the first the bundle has. */
  icon: string[];
  commandId: string;
}

interface CalloutType {
  id: string;
  title: string;
  icon: string[];
}

/** One pickable entry in a right-opening submenu. */
interface SubmenuEntry {
  title: string;
  icon: string[];
  action: () => void;
  disabled?: boolean;
}

/** Registers the Bear-style icons Lucide has no equivalent for: boxed heading numerals and the dot-line separator. */
function registerCustomIcons(): void {
  HEADING_LEVELS.forEach((level) => {
    addIcon(
      `${HEADING_ICON_PREFIX}${level}`,
      `<rect x="14" y="14" width="72" height="72" rx="16" fill="none" stroke="currentColor" stroke-width="7"/><text x="50" y="68" text-anchor="middle" font-size="48" font-weight="600" fill="currentColor">${level}</text>`
    );
  });
  addIcon(
    SEPARATOR_ICON,
    '<circle cx="16" cy="50" r="9" fill="currentColor"/><line x1="34" y1="50" x2="88" y2="50" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'
  );
}

const BLOCK_MENU_ITEMS: BlockMenuItem[] = [
  { title: "List", icon: ["list"], commandId: "editor:toggle-bullet-list" },
  { title: "Ordered list", icon: ["list-ordered"], commandId: "editor:toggle-numbered-list" },
  { title: "Block quote", icon: ["message-square-quote", "quote"], commandId: "editor:toggle-blockquote" },
  { title: "Todo", icon: ["check-square", "square-check"], commandId: "editor:toggle-checklist-status" },
];

const CALLOUT_TYPES: CalloutType[] = [
  { id: "note", title: "Note", icon: ["pencil"] },
  { id: "tip", title: "Tip", icon: ["flame"] },
  { id: "important", title: "Important", icon: ["alert-circle", "circle-alert"] },
  { id: "warning", title: "Warning", icon: ["alert-triangle", "triangle-alert"] },
  { id: "caution", title: "Caution", icon: ["alert-octagon", "octagon-alert"] },
];

/**
 * The Bear-style floating toolbar shown on paginated panes: a collapsed circle
 * that expands on hover into formatting controls, all mapped to Obsidian's own
 * commands so behavior always matches the user's keybindings and settings.
 */
export class NoteToolbar {
  /** One observer per pane, so the bar re-anchors when the pane is resized. */
  private readonly hostObservers = new Map<HTMLElement, HostWatch>();
  /** Direction bars are built for; sync() keeps it current and rebuilds bars that disagree. */
  private vertical = false;

  constructor(
    private readonly app: App,
    private readonly actions: ToolbarActions
  ) {
    registerCustomIcons();
  }

  /**
   * Ensures each open Markdown pane has a toolbar exactly when the predicate says so.
   * A direction change rebuilds existing bars, since tooltip placement is set at build time.
   */
  sync(shouldShow: (view: MarkdownView) => boolean, direction: ToolbarDirection = "horizontal"): void {
    this.vertical = direction === "vertical";
    this.pruneClosedHosts();
    this.markdownViews().forEach((view) => {
      const host = view.contentEl;
      let existing = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
      if (!shouldShow(view)) {
        existing?.remove();
        host.classList.remove(HOST_CLASS);
        this.hostObservers.get(host)?.disconnect();
        this.hostObservers.delete(host);
        return;
      }
      if (existing instanceof HTMLElement && existing.classList.contains(VERTICAL_CLASS) !== this.vertical) {
        existing.remove();
        existing = null;
      }
      if (existing instanceof HTMLElement) {
        this.position(existing, host);
        this.observeHost(host);
        return;
      }
      host.classList.add(HOST_CLASS);
      const bar = this.build(view);
      host.append(bar);
      this.position(bar, host);
      this.observeHost(host);
    });
  }

  /**
   * Stops all observation for the duration of a print or PDF export. The bars stay
   * in place (the print stylesheet hides them); the next sync() re-observes hosts.
   */
  suspend(): void {
    this.hostObservers.forEach((observer) => observer.disconnect());
    this.hostObservers.clear();
  }

  dispose(): void {
    this.hostObservers.forEach((observer) => observer.disconnect());
    this.hostObservers.clear();
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.classList.remove(HOST_CLASS));
  }

  /**
   * Anchors the collapsed handle 12px left of the sheet (clamped to the pane edge);
   * the expanded tray slides rightward from there. Anchoring on the collapsed footprint
   * keeps the handle stationary across expand and collapse.
   */
  private position(bar: HTMLElement, host: HTMLElement): void {
    const pageWidth = parseFloat(getComputedStyle(document.body).getPropertyValue("--pagewise-page-width"));
    if (!Number.isFinite(pageWidth)) return;
    const pageLeft = (host.clientWidth - pageWidth) / 2;
    const handle = bar.querySelector<HTMLElement>(".pagewise-toolbar-handle");
    const collapsedWidth = (handle?.offsetWidth ?? bar.offsetWidth) + 6;
    bar.style.left = `${Math.max(8, pageLeft - collapsedWidth - 12)}px`;
    bar.style.top = `${findBarBottom(host, bar) + TOOLBAR_TOP_INSET_PX}px`;
  }

  /**
   * Re-anchors on pane resizes and whenever the find bar opens, closes, or changes
   * height (find vs. find-and-replace). Obsidian creates the find bar lazily, so a
   * child-list watch on the pane and its two content views picks up its arrival and
   * adds it to the resize watch; showing or hiding it then registers as a resize.
   * The child-list watch is shallow, so typing in the editor never triggers it.
   */
  private observeHost(host: HTMLElement): void {
    if (this.hostObservers.has(host)) return;
    const reposition = () => {
      const bar = host.querySelector(`:scope > .${TOOLBAR_CLASS}`);
      if (bar instanceof HTMLElement) this.position(bar, host);
    };
    const resize = new ResizeObserver(reposition);
    const watchFindBars = () => host.querySelectorAll(FIND_BAR_SELECTOR).forEach((el) => resize.observe(el));
    resize.observe(host);
    watchFindBars();
    const mutation = new MutationObserver(() => {
      watchFindBars();
      reposition();
    });
    mutation.observe(host, { childList: true });
    host.querySelectorAll(CONTENT_VIEW_SELECTOR).forEach((el) => mutation.observe(el, { childList: true }));
    this.hostObservers.set(host, {
      disconnect: () => {
        resize.disconnect();
        mutation.disconnect();
      },
    });
  }

  /** A closed pane leaves a detached host; drop its observer so the map cannot grow without bound. */
  private pruneClosedHosts(): void {
    this.hostObservers.forEach((observer, host) => {
      if (host.isConnected) return;
      observer.disconnect();
      this.hostObservers.delete(host);
    });
  }

  private build(view: MarkdownView): HTMLElement {
    const bar = document.createElement("div");
    bar.className = TOOLBAR_CLASS;
    bar.classList.toggle(VERTICAL_CLASS, this.vertical);
    bar.addEventListener("mousedown", (event) => event.preventDefault());
    const format = document.createElement("div");
    format.className = FORMAT_GROUP_CLASS;
    format.append(
      this.headingButton(view),
      this.blocksButton(view),
      this.iconButton(["bold"], "Bold", () => this.command("editor:toggle-bold")),
      this.iconButton(["italic"], "Italic", () => this.command("editor:toggle-italics")),
      this.iconButton(["paintbrush-vertical", "paintbrush-2", "paintbrush"], "Highlight", () =>
        this.command("editor:toggle-highlight")
      ),
      this.iconButton(["link-2", "link"], "Insert link", () => this.command("editor:insert-link")),
      this.tableButton(view),
      this.iconButton(["image-plus", "image"], "Insert image", () => this.command("editor:attach-file"))
    );
    const content = document.createElement("div");
    content.className = "pagewise-toolbar-content";
    content.append(format, this.iconButton(["info"], "Toggle properties sidebar", this.actions.toggleProperties));
    const reveal = document.createElement("div");
    reveal.className = "pagewise-toolbar-reveal";
    reveal.append(content);
    bar.append(this.handleButton(bar), reveal);
    this.wireCollapse(bar);
    return bar;
  }

  /** The always-visible handle: a plus circle at rest, a chevron circle while expanded. */
  private handleButton(bar: HTMLElement): HTMLElement {
    const button = this.button("Formatting tools", () => bar.classList.toggle(EXPANDED_CLASS));
    button.classList.add("pagewise-toolbar-handle");
    const plus = document.createElement("span");
    plus.className = "pagewise-handle-icon is-plus";
    setIcon(plus, resolveIcon(["circle-plus", "plus-circle"]));
    const chevron = document.createElement("span");
    chevron.className = "pagewise-handle-icon is-chevron";
    setIcon(chevron, resolveIcon(["circle-chevron-right", "chevron-right-circle"]));
    button.append(plus, chevron);
    return button;
  }

  /**
   * Collapse state machine: hovering the bar expands it at once; after the pointer
   * leaves, it stays expanded for a five-second grace period, then collapses. Re-entering
   * during the grace period cancels the collapse. The handle click toggles for trackpads.
   */
  private wireCollapse(bar: HTMLElement): void {
    let timer: number | null = null;
    bar.addEventListener("mouseenter", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      bar.classList.add(EXPANDED_CLASS);
    });
    bar.addEventListener("mouseleave", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => bar.classList.remove(EXPANDED_CLASS), COLLAPSE_DELAY_MS);
    });
  }

  /** The H control: the heading icon with a chevron that opens the Heading 1-6 menu. */
  private headingButton(view: MarkdownView): HTMLElement {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    setIcon(face, "heading");
    return this.menuButton(face, "Headings", (menu) => {
      HEADING_LEVELS.forEach((level) => {
        menu.addItem((item) =>
          item
            .setTitle(`Heading ${level}`)
            .setIcon(`${HEADING_ICON_PREFIX}${level}`)
            .onClick(() => this.setHeading(view, level))
        );
      });
    });
  }

  /** The blocks control: Bear's list menu, mapped to Obsidian's own Markdown commands. */
  private blocksButton(view: MarkdownView): HTMLElement {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    setIcon(face, "list");
    return this.menuButton(face, "Lists and blocks", (menu) => {
      BLOCK_MENU_ITEMS.forEach(({ title, icon, commandId }) => {
        menu.addItem((item) => {
          item
            .setTitle(title)
            .setIcon(resolveIcon(icon))
            .onClick(() => this.command(commandId));
          this.appendHotkeyHint(item, commandId);
        });
      });
      this.calloutMenuItem(menu, "Callout", view, false);
      this.calloutMenuItem(menu, "Callout (inline)", view, true);
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("Separator")
          .setIcon(SEPARATOR_ICON)
          .onClick(() => this.insertSeparator(view))
      );
    });
  }

  /** The table control: insert a new table, or operate on the one under the cursor. */
  private tableButton(view: MarkdownView): HTMLElement {
    const face = document.createElement("span");
    face.className = "pagewise-chevron";
    setIcon(face, resolveIcon(["grid-3x3", "grid", "table"]));
    return this.menuButton(face, "Table", (menu) => this.fillTableMenu(menu, view));
  }

  /**
   * The table menu, built fresh on every open so it reflects where the cursor is:
   * everything but "New table" needs the cursor inside a table, and row operations
   * additionally need it on a body row rather than the header or delimiter line.
   * Operations rewrite the table's Markdown directly, because Obsidian keeps its
   * own table functions in the widget's private context menu, not in commands.
   */
  private fillTableMenu(menu: Menu, view: MarkdownView): void {
    const editor = view.editor;
    const located = locateTable(editor);
    const inTable = located !== null;
    const onBodyRow = located?.context.bodyRow !== null && inTable;
    const edit = (transform: Parameters<typeof applyTableEdit>[1]) => () => applyTableEdit(editor, transform);
    const alignEntry = (title: string, icon: string[], alignment: ColumnAlignment): SubmenuEntry => ({
      title,
      icon,
      action: edit((model, ctx) => setAlignment(model, ctx.column, ctx.columnEnd, alignment)),
    });

    menu.addItem((item) => {
      item
        .setTitle("New table")
        .setIcon(resolveIcon(["table", "grid-3x3"]))
        .onClick(() => this.command("editor:insert-table"));
      this.appendHotkeyHint(item, "editor:insert-table");
    });
    menu.addSeparator();
    this.submenuItem(
      menu,
      "Align column",
      ["align-center", "align-left"],
      [
        alignEntry("Left", ["align-left"], "left"),
        alignEntry("Center", ["align-center"], "center"),
        alignEntry("Right", ["align-right"], "right"),
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Insert",
      ["plus"],
      [
        {
          title: "Row above",
          icon: ["arrow-up-to-line", "arrow-up"],
          action: edit((model, ctx) => insertRow(model, ctx.bodyRow ?? 0)),
        },
        {
          title: "Row below",
          icon: ["arrow-down-to-line", "arrow-down"],
          action: edit((model, ctx) => insertRow(model, ctx.bodyRow === null ? 0 : ctx.bodyRow + 1)),
        },
        {
          title: "Column left",
          icon: ["arrow-left-to-line", "arrow-left"],
          action: edit((model, ctx) => insertColumn(model, ctx.column)),
        },
        {
          title: "Column right",
          icon: ["arrow-right-to-line", "arrow-right"],
          action: edit((model, ctx) => insertColumn(model, ctx.column + 1)),
        },
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Move",
      ["move", "move-3d"],
      [
        {
          title: "Row up",
          icon: ["move-up", "arrow-up"],
          action: edit((model, ctx) => (ctx.bodyRow === null ? null : moveRow(model, ctx.bodyRow, -1))),
          disabled: !onBodyRow,
        },
        {
          title: "Row down",
          icon: ["move-down", "arrow-down"],
          action: edit((model, ctx) => (ctx.bodyRow === null ? null : moveRow(model, ctx.bodyRow, 1))),
          disabled: !onBodyRow,
        },
        {
          title: "Column left",
          icon: ["move-left", "arrow-left"],
          action: edit((model, ctx) => moveColumn(model, ctx.column, -1)),
        },
        {
          title: "Column right",
          icon: ["move-right", "arrow-right"],
          action: edit((model, ctx) => moveColumn(model, ctx.column, 1)),
        },
      ],
      !inTable
    );
    this.submenuItem(
      menu,
      "Delete",
      ["trash-2", "trash"],
      [
        {
          title: "Row",
          icon: ["trash-2", "trash"],
          action: edit((model, ctx) => (ctx.bodyRow === null ? null : deleteRow(model, ctx.bodyRow))),
          disabled: !onBodyRow,
        },
        {
          title: "Column",
          icon: ["trash-2", "trash"],
          action: edit((model, ctx) => deleteColumn(model, ctx.column)),
        },
        { title: "Table", icon: ["trash-2", "trash"], action: () => deleteTable(editor) },
      ],
      !inTable
    );
    menu.addSeparator();
    this.submenuItem(
      menu,
      "Sort rows",
      ["arrow-down-a-z", "sort-asc"],
      [
        {
          title: "A to Z",
          icon: ["arrow-down-a-z", "sort-asc"],
          action: edit((model, ctx) => sortRows(model, ctx.column, true)),
        },
        {
          title: "Z to A",
          icon: ["arrow-down-z-a", "sort-desc"],
          action: edit((model, ctx) => sortRows(model, ctx.column, false)),
        },
      ],
      !inTable
    );
    menu.addItem((item) => {
      item.setTitle("Duplicate row").setIcon(resolveIcon(["copy-plus", "copy"]));
      if (!onBodyRow) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model, ctx) => (ctx.bodyRow === null ? null : duplicateRow(model, ctx.bodyRow))));
    });
    menu.addItem((item) => {
      item.setTitle("Tidy table").setIcon(resolveIcon(["wand-sparkles", "wand-2", "wand"]));
      if (!inTable) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model) => model));
    });
    menu.addItem((item) => {
      item.setTitle("Transpose").setIcon(resolveIcon(["move-diagonal", "maximize-2"]));
      if (!inTable) {
        item.setDisabled(true);
        return;
      }
      item.onClick(edit((model) => transpose(model)));
    });
  }

  /**
   * A button whose face is the given element and whose click opens a native menu:
   * under the pointer in horizontal mode, and at the button's right edge in vertical
   * mode so the menu never covers the controls below it.
   */
  private menuButton(face: HTMLElement, label: string, fill: (menu: Menu) => void): HTMLElement {
    const button = this.button(label, (event) => {
      const menu = new Menu();
      menu.setUseNativeMenu(false);
      (menu as MenuWithDom).dom?.classList.add("pagewise-menu");
      fill(menu);
      if (button.closest(`.${TOOLBAR_CLASS}`)?.classList.contains(VERTICAL_CLASS)) {
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right + 6, y: rect.top });
      } else {
        menu.showAtMouseEvent(event);
      }
    });
    button.classList.add("has-menu");
    const chevron = document.createElement("span");
    chevron.className = "pagewise-chevron";
    setIcon(chevron, "chevron-down");
    button.append(face, chevron);
    return button;
  }

  /** A callout entry whose submenu offers Bear's five types. */
  private calloutMenuItem(menu: Menu, title: string, view: MarkdownView, inline: boolean): void {
    this.submenuItem(
      menu,
      title,
      ["list-indent-increase", "indent"],
      CALLOUT_TYPES.map(({ id, title: entryTitle, icon }) => ({
        title: entryTitle,
        icon,
        action: () => this.insertCallout(view, id, inline),
      }))
    );
  }

  /**
   * A menu entry with a submenu of the given entries, opened on hover or click and
   * placed at the entry's right edge so it never covers the parent menu. Hovering a
   * different parent entry closes it. Without a reachable item DOM (no place to
   * anchor), the entry itself runs the first enabled action.
   */
  private submenuItem(menu: Menu, title: string, icon: string[], entries: SubmenuEntry[], disabled = false): void {
    menu.addItem((item) => {
      item.setTitle(title).setIcon(resolveIcon(icon));
      if (disabled) {
        item.setDisabled(true);
        return;
      }
      const itemDom = (item as MenuItemWithDom).dom;
      if (!itemDom) {
        const fallback = entries.find((entry) => !entry.disabled);
        if (fallback) item.onClick(() => fallback.action());
        return;
      }
      const arrow = document.createElement("span");
      arrow.className = "pagewise-submenu-arrow";
      setIcon(arrow, "chevron-right");
      itemDom.append(arrow);
      let submenu: Menu | null = null;
      const close = () => {
        submenu?.hide();
        submenu = null;
      };
      const open = () => {
        if (submenu) return;
        submenu = this.buildEntrySubmenu(menu, entries);
        const rect = itemDom.getBoundingClientRect();
        submenu.showAtPosition({ x: rect.right + 4, y: rect.top });
      };
      itemDom.addEventListener("mouseenter", open);
      item.onClick(open);
      (menu as MenuWithDom).dom?.addEventListener("mouseover", (event) => {
        if (event.target instanceof Node && !itemDom.contains(event.target)) close();
      });
    });
  }

  /** The submenu itself; picking an entry runs it and closes both menus. */
  private buildEntrySubmenu(parent: Menu, entries: SubmenuEntry[]): Menu {
    const submenu = new Menu();
    submenu.setUseNativeMenu(false);
    (submenu as MenuWithDom).dom?.classList.add("pagewise-menu");
    entries.forEach(({ title, icon, action, disabled }) =>
      submenu.addItem((item) => {
        item.setTitle(title).setIcon(resolveIcon(icon));
        if (disabled) {
          item.setDisabled(true);
          return;
        }
        item.onClick(() => {
          action();
          parent.hide();
        });
      })
    );
    return submenu;
  }

  /**
   * Inserts an Obsidian callout. Block form puts the marker on its own line with the
   * selection as quoted body lines; inline form is the one-line `> [!type] text` callout.
   */
  private insertCallout(view: MarkdownView, type: string, inline: boolean): void {
    const editor = view.editor;
    const selection = editor.getSelection();
    const line = editor.getLine(editor.getCursor().line);
    const lead = line.trim().length === 0 ? "" : "\n\n";
    if (inline) {
      editor.replaceSelection(`${lead}> [!${type}] ${selection}`);
      return;
    }
    const body = selection
      ? selection
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n")
      : "> ";
    editor.replaceSelection(`${lead}> [!${type}]\n${body}`);
  }

  /** Shows the user's actual hotkey for the command, Bear-style; nothing when unbound. */
  private appendHotkeyHint(item: MenuItem, commandId: string): void {
    const hint = (this.app as AppWithCommands).hotkeyManager?.printHotkeyForCommand?.(commandId);
    const dom = (item as MenuItemWithDom).dom;
    if (!hint || !dom) return;
    const span = document.createElement("span");
    span.className = "pagewise-hotkey";
    span.textContent = hint;
    dom.append(span);
  }

  /** Inserts a thematic break (---) on its own line at the cursor. */
  private insertSeparator(view: MarkdownView): void {
    const editor = view.editor;
    const lineNumber = editor.getCursor().line;
    const line = editor.getLine(lineNumber);
    editor.replaceSelection(line.trim().length === 0 ? "---\n" : "\n\n---\n");
  }

  /** Sets the cursor line to the given heading level; picking its current level clears it. */
  private setHeading(view: MarkdownView, level: number): void {
    const editor = view.editor;
    const lineNumber = editor.getCursor().line;
    const line = editor.getLine(lineNumber);
    const match = /^(#{1,6})\s+/.exec(line);
    const body = match ? line.slice(match[0].length) : line;
    const next = match?.[1].length === level ? body : `${"#".repeat(level)} ${body}`;
    editor.setLine(lineNumber, next);
    editor.setCursor({ line: lineNumber, ch: next.length });
  }

  private iconButton(icons: string[], label: string, onClick: (event: MouseEvent) => void): HTMLElement {
    const button = this.button(label, onClick);
    setIcon(button, resolveIcon(icons));
    return button;
  }

  private button(label: string, onClick: (event: MouseEvent) => void): HTMLElement {
    const button = document.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.setAttribute("aria-label", label);
    /* Tooltips sit beside the stack in vertical mode so they never cover the next control. */
    setTooltip(button, label, { placement: this.vertical ? "right" : "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
    return button;
  }

  private command(id: string): void {
    (this.app as AppWithCommands).commands.executeCommandById(id);
  }

  private markdownViews(): MarkdownView[] {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView);
  }
}

/**
 * How far down the pane a displayed find bar reaches over the toolbar's column, or 0.
 * A find bar that floats elsewhere (some themes pin it top-right) does not move the bar.
 */
function findBarBottom(host: HTMLElement, bar: HTMLElement): number {
  const hostRect = host.getBoundingClientRect();
  const barLeft = parseFloat(bar.style.left) || 0;
  const barRight = barLeft + bar.offsetWidth;
  let bottom = 0;
  host.querySelectorAll<HTMLElement>(FIND_BAR_SELECTOR).forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;
    const left = rect.left - hostRect.left;
    const right = rect.right - hostRect.left;
    if (right <= barLeft || left >= barRight) return;
    bottom = Math.max(bottom, rect.bottom - hostRect.top);
  });
  return bottom;
}

/** Picks the first icon name the running Lucide bundle actually has; older bundles lag renames. */
function resolveIcon(icons: string[]): string {
  return icons.find((name) => getIcon(name)) ?? icons[icons.length - 1];
}
