import { Menu, setIcon, type App, type MenuItem } from "obsidian";
import { hotkeyFor, menuDom, menuItemDom } from "../obsidianInternals";
import { resolveIcon, type IconChoice } from "./icons";

/**
 * Menu plumbing shared by every toolbar menu: Pagewise-styled menus, right-opening
 * submenus, and hotkey hints. Menu contents live in their own modules.
 */

/** One pickable entry in a submenu. */
export interface MenuEntry {
  title: string;
  icon: IconChoice;
  action: () => void;
  disabled?: boolean;
}

const MENU_CLASS = "pagewise-menu";

/**
 * Obsidian's Menu keeps a single hide callback, so a second onHide() silently
 * replaces the first. Pagewise menus register hide listeners here instead, and
 * createMenu installs one callback that runs them all.
 */
const hideListeners = new WeakMap<Menu, (() => void)[]>();

/**
 * A Pagewise menu. Obsidian's native macOS menus drop custom icons, so these always
 * render as Obsidian's own HTML menus; the class lets the stylesheet restore menu
 * icons in themes (such as Minimal) that hide them.
 */
export function createMenu(): Menu {
  const menu = new Menu();
  menu.setUseNativeMenu(false);
  menuDom(menu)?.classList.add(MENU_CLASS);
  const listeners: (() => void)[] = [];
  hideListeners.set(menu, listeners);
  menu.onHide(() => listeners.forEach((listener) => listener()));
  return menu;
}

/** Runs the listener when the menu closes, alongside any other listener already registered. */
export function whenHidden(menu: Menu, listener: () => void): void {
  const listeners = hideListeners.get(menu);
  if (listeners) listeners.push(listener);
  else menu.onHide(listener);
}

/** Adds a plain entry; a disabled entry shows greyed out and does nothing. */
export function addEntry(menu: Menu, entry: MenuEntry): MenuItem {
  let added!: MenuItem;
  menu.addItem((item) => {
    added = item;
    item.setTitle(entry.title).setIcon(resolveIcon(entry.icon));
    if (entry.disabled) item.setDisabled(true);
    else item.onClick(entry.action);
  });
  return added;
}

/**
 * Adds an entry whose submenu opens on hover or click at the entry's right edge, so
 * it never covers the parent. Hovering another parent entry, or the parent closing,
 * closes it. Picking a submenu entry runs it and closes both menus. Without a
 * reachable item element (no place to anchor), the entry runs its first enabled action.
 */
export function addSubmenu(menu: Menu, title: string, icon: IconChoice, entries: MenuEntry[], disabled = false): void {
  menu.addItem((item) => {
    item.setTitle(title).setIcon(resolveIcon(icon));
    if (disabled) {
      item.setDisabled(true);
      return;
    }
    const itemDom = menuItemDom(item);
    if (!itemDom) {
      const fallback = entries.find((entry) => !entry.disabled);
      if (fallback) item.onClick(fallback.action);
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
      submenu = createMenu();
      entries.forEach((entry) =>
        addEntry(submenu!, {
          ...entry,
          action: () => {
            entry.action();
            menu.hide();
          },
        })
      );
      const rect = itemDom.getBoundingClientRect();
      submenu.showAtPosition({ x: rect.right + 4, y: rect.top });
    };
    itemDom.addEventListener("mouseenter", open);
    item.onClick(open);
    menuDom(menu)?.addEventListener("mouseover", (event) => {
      if (event.target instanceof Node && !itemDom.contains(event.target)) close();
    });
    whenHidden(menu, close);
  });
}

/** Appends the user's actual hotkey for the command, Bear-style; nothing when unbound. */
export function addHotkeyHint(app: App, item: MenuItem, commandId: string): void {
  const hint = hotkeyFor(app, commandId);
  const dom = menuItemDom(item);
  if (!hint || !dom) return;
  const span = document.createElement("span");
  span.className = "pagewise-hotkey";
  span.textContent = hint;
  dom.append(span);
}
