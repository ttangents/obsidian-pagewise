import { setIcon, setTooltip, type App, type Menu, type MarkdownView } from "obsidian";
import { executeCommand } from "../obsidianInternals";
import type { ToolbarDirection } from "../settings";
import { markdownViews } from "../workspace";
import { anchorBar, watchAnchor, type AnchorWatch } from "./anchor";
import { fillBlocksMenu, fillHeadingMenu } from "./formatMenus";
import { registerCustomIcons, resolveIcon, type IconChoice } from "./icons";
import { HEADING_LEVELS } from "./markdownActions";
import { createMenu } from "./menus";
import { fillTableMenu } from "./tableMenu";

const TOOLBAR_CLASS = "pagewise-toolbar";
const HOST_CLASS = "pagewise-has-toolbar";
const EXPANDED_CLASS = "is-expanded";
const VERTICAL_CLASS = "is-vertical";
const COLLAPSE_DELAY_MS = 5000;

/** What the toolbar asks of its owner beyond formatting. */
export interface ToolbarActions {
  toggleProperties(): void;
}

/**
 * The Bear-style floating toolbar on paginated panes: a collapsed circle that expands
 * on hover into formatting controls. This class owns the toolbar's lifecycle per pane
 * and its DOM; placement lives in anchor.ts and menu contents in their own modules.
 */
export class NoteToolbar {
  private readonly watches = new Map<HTMLElement, AnchorWatch>();
  /** Direction bars are built for; sync() rebuilds any bar built for the other one. */
  private vertical = false;

  constructor(
    private readonly app: App,
    private readonly actions: ToolbarActions
  ) {
    registerCustomIcons(HEADING_LEVELS);
  }

  /** Ensures each open Markdown pane has a toolbar exactly when the predicate says so. */
  sync(shouldShow: (view: MarkdownView) => boolean, direction: ToolbarDirection): void {
    this.vertical = direction === "vertical";
    this.releaseClosedPanes();
    markdownViews(this.app).forEach((view) => {
      const host = view.contentEl;
      let bar = host.querySelector<HTMLElement>(`:scope > .${TOOLBAR_CLASS}`);
      if (!shouldShow(view)) {
        this.detach(host, bar);
        return;
      }
      if (bar && bar.classList.contains(VERTICAL_CLASS) !== this.vertical) {
        bar.remove();
        bar = null;
      }
      if (!bar) {
        host.classList.add(HOST_CLASS);
        bar = this.build(view);
        host.append(bar);
      }
      anchorBar(bar, host);
      this.watch(host);
    });
  }

  /** Stops all observation during a print or PDF export; the next sync() resumes it. */
  suspend(): void {
    this.watches.forEach((watch) => watch.disconnect());
    this.watches.clear();
  }

  dispose(): void {
    this.suspend();
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.classList.remove(HOST_CLASS));
  }

  private detach(host: HTMLElement, bar: HTMLElement | null): void {
    bar?.remove();
    host.classList.remove(HOST_CLASS);
    this.watches.get(host)?.disconnect();
    this.watches.delete(host);
  }

  private watch(host: HTMLElement): void {
    if (this.watches.has(host)) return;
    this.watches.set(
      host,
      watchAnchor(host, () => {
        const bar = host.querySelector<HTMLElement>(`:scope > .${TOOLBAR_CLASS}`);
        if (bar) anchorBar(bar, host);
      })
    );
  }

  /** A closed pane leaves a detached host; release its watch so the map cannot grow without bound. */
  private releaseClosedPanes(): void {
    this.watches.forEach((watch, host) => {
      if (host.isConnected) return;
      watch.disconnect();
      this.watches.delete(host);
    });
  }

  private build(view: MarkdownView): HTMLElement {
    const bar = document.createElement("div");
    bar.className = TOOLBAR_CLASS;
    bar.classList.toggle(VERTICAL_CLASS, this.vertical);
    // Keep the editor's selection: clicks on the bar must not move focus.
    bar.addEventListener("mousedown", (event) => event.preventDefault());

    const command = (id: string) => () => executeCommand(this.app, id);
    const format = document.createElement("div");
    format.className = "pagewise-toolbar-format";
    format.append(
      this.menuButton(["heading"], "Headings", (menu) => fillHeadingMenu(menu, view.editor)),
      this.menuButton(["list"], "Lists and blocks", (menu) => fillBlocksMenu(menu, this.app, view.editor)),
      this.iconButton(["bold"], "Bold", command("editor:toggle-bold")),
      this.iconButton(["italic"], "Italic", command("editor:toggle-italics")),
      this.iconButton(["paintbrush-vertical", "paintbrush-2", "paintbrush"], "Highlight", command("editor:toggle-highlight")),
      this.iconButton(["link-2", "link"], "Insert link", command("editor:insert-link")),
      this.menuButton(["grid-3x3", "grid", "table"], "Table", (menu) => fillTableMenu(menu, this.app, view.editor)),
      this.iconButton(["image-plus", "image"], "Insert image", command("editor:attach-file"))
    );
    const content = document.createElement("div");
    content.className = "pagewise-toolbar-content";
    content.append(format, this.iconButton(["info"], "Toggle properties sidebar", () => this.actions.toggleProperties()));
    const reveal = document.createElement("div");
    reveal.className = "pagewise-toolbar-reveal";
    reveal.append(content);

    bar.append(this.handleButton(bar), reveal);
    wireCollapse(bar);
    return bar;
  }

  /** The always-visible handle: a plus circle at rest, a chevron circle while expanded. */
  private handleButton(bar: HTMLElement): HTMLElement {
    const button = this.button("Formatting tools", () => bar.classList.toggle(EXPANDED_CLASS));
    button.classList.add("pagewise-toolbar-handle");
    button.append(
      iconSpan("pagewise-handle-icon is-plus", ["circle-plus", "plus-circle"]),
      iconSpan("pagewise-handle-icon is-chevron", ["circle-chevron-right", "chevron-right-circle"])
    );
    return button;
  }

  /**
   * A button showing an icon and a dropdown chevron. Its menu opens under the pointer
   * in horizontal mode, and at the button's right edge in vertical mode so it never
   * covers the controls below.
   */
  private menuButton(icon: IconChoice, label: string, fill: (menu: Menu) => void): HTMLElement {
    const button = this.button(label, (event) => {
      const menu = createMenu();
      fill(menu);
      if (this.vertical) {
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right + 6, y: rect.top });
      } else {
        menu.showAtMouseEvent(event);
      }
    });
    button.classList.add("has-menu");
    button.append(iconSpan("pagewise-chevron", icon), iconSpan("pagewise-chevron", ["chevron-down"]));
    return button;
  }

  private iconButton(icon: IconChoice, label: string, onClick: () => void): HTMLElement {
    const button = this.button(label, onClick);
    setIcon(button, resolveIcon(icon));
    return button;
  }

  private button(label: string, onClick: (event: MouseEvent) => void): HTMLElement {
    const button = document.createElement("button");
    button.className = "pagewise-toolbar-button clickable-icon";
    button.setAttribute("aria-label", label);
    // Beside the stack in vertical mode, so a tooltip never covers the next control.
    setTooltip(button, label, { placement: this.vertical ? "right" : "bottom" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
    return button;
  }
}

/**
 * Collapse behavior: hovering the bar expands it at once; after the pointer leaves it
 * stays expanded for a five-second grace period, then collapses. Re-entering during
 * the grace period cancels the collapse. The handle's click toggles it for trackpads.
 */
function wireCollapse(bar: HTMLElement): void {
  let timer: number | null = null;
  const cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  bar.addEventListener("mouseenter", () => {
    cancel();
    bar.classList.add(EXPANDED_CLASS);
  });
  bar.addEventListener("mouseleave", () => {
    cancel();
    timer = window.setTimeout(() => bar.classList.remove(EXPANDED_CLASS), COLLAPSE_DELAY_MS);
  });
}

function iconSpan(className: string, icon: IconChoice): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  setIcon(span, resolveIcon(icon));
  return span;
}
