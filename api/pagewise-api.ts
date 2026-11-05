/**
 * Pagewise toolbar API, version 1: types and a connect helper for other plugins.
 *
 * Copy this file into your plugin. It depends only on the `obsidian` package and
 * never imports Pagewise, so your plugin builds and runs whether or not Pagewise
 * is installed. The guide is docs/TOOLBAR-API.md in Pagewise's repository:
 * https://github.com/ttangents/obsidian-pagewise/blob/main/docs/TOOLBAR-API.md
 *
 * License: this file alone is under the MIT No Attribution license (MIT-0), so you
 * can copy it into your plugin with or without credit. The rest of Pagewise is MIT.
 *
 * Copyright 2026 ttangents
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
 * AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import type { Editor, EventRef, MarkdownView, Menu, TFile } from "obsidian";

/** The pane a toolbar item acts on, handed to every callback. */
export interface PagewiseToolbarContext {
  view: MarkdownView;
  file: TFile | null;
  editor: Editor;
  /** "source" covers Live Preview and Source mode; "preview" is Reading view. */
  mode: "source" | "preview";
}

/** A small mark on an item's button (Pagewise 0.38.0 and later; older versions ignore it). */
export interface PagewiseToolbarBadge {
  kind: "progress" | "dot";
  /** For "progress": how much is done, from 0 to 1. Leave it out while the total is unknown; the ring then turns. */
  value?: number;
  /** Added to the button's accessible name and tooltip. */
  label?: string;
}

/** One button your plugin adds to the toolbar. */
export interface PagewiseToolbarItem {
  /** Unique across plugins; by convention "<your-plugin-id>:<name>". Registering an id again replaces the item. */
  id: string;
  /** The button's accessible name and tooltip, in sentence case. */
  label: string;
  /** A Lucide icon name Obsidian ships, such as "sparkles". */
  icon: string;
  /** Runs when the button is pressed. Give exactly one of onClick and menu. */
  onClick?: (context: PagewiseToolbarContext) => void | Promise<void>;
  /** Fills the menu the button opens. Give exactly one of onClick and menu. */
  menu?: (menu: Menu, context: PagewiseToolbarContext) => void;
  /** Makes an onClick button a toggle: true shows it pressed. */
  isActive?: (context: PagewiseToolbarContext) => boolean;
  /** False hides the button on this pane. Defaults to shown. */
  isVisible?: (context: PagewiseToolbarContext) => boolean;
  /** Also show the button in Reading view. Defaults to false. */
  readingView?: boolean;
  /** The button's badge on this pane, or null for none. */
  badge?: (context: PagewiseToolbarContext) => PagewiseToolbarBadge | null;
}

/** The API object Pagewise announces: frozen, and inert after Pagewise unloads. */
export interface PagewiseApi {
  readonly version: 1;
  /** Adds a toolbar item and returns the function that removes it. Never throws. */
  registerToolbarItem(item: PagewiseToolbarItem): () => void;
  /** Asks every toolbar to re-read isVisible, isActive and badge, after your state changed. */
  refreshToolbar(): void;
}

/** The workspace events of the handshake. */
export const PAGEWISE_EVENTS = {
  ready: "pagewise:ready",
  request: "pagewise:request",
  unload: "pagewise:unload",
} as const;

/** The parts of an Obsidian plugin the helper uses; a `Plugin` provides all of them. */
export interface PagewiseHost {
  app: {
    workspace: {
      on(name: string, callback: (...data: unknown[]) => unknown): EventRef;
      trigger(name: string, ...data: unknown[]): void;
    };
  };
  registerEvent(ref: EventRef): void;
  register(callback: () => unknown): void;
}

/**
 * Connects your plugin to Pagewise in either load order and keeps the connection
 * through Pagewise being reloaded, turned off and turned on again. Call it once in
 * `onload`.
 *
 * `attach` runs each time a compatible Pagewise becomes available. Register your
 * items there and return a function that removes them; the helper calls it when
 * Pagewise unloads, when it announces a different API object, and when your plugin
 * unloads. Every call into Pagewise and into `attach` is guarded, so a failure on
 * either side costs only your buttons.
 *
 * `onIncompatible` runs once if an installed Pagewise announces no version 1 API,
 * so you can say so in your own UI. By default the helper logs one warning.
 */
export function connectPagewise(
  plugin: PagewiseHost,
  attach: (api: PagewiseApi) => (() => void) | void,
  onIncompatible: () => void = () => console.warn("This plugin does not support the installed version of Pagewise.")
): void {
  const { workspace } = plugin.app;
  let current: PagewiseApi | null = null;
  let detach: (() => void) | null = null;
  let warned = false;

  const release = () => {
    try {
      detach?.();
    } catch (error) {
      console.warn("Removing the Pagewise toolbar items failed.", error);
    }
    detach = null;
    current = null;
  };

  const connect = (announced: unknown) => {
    if (announced !== null && announced === current) return;
    release();
    if (!isPagewiseApi(announced)) {
      if (!warned) {
        warned = true;
        onIncompatible();
      }
      return;
    }
    current = announced;
    try {
      detach = attach(announced) ?? null;
    } catch (error) {
      console.warn("Adding the Pagewise toolbar items failed.", error);
    }
  };

  plugin.registerEvent(workspace.on(PAGEWISE_EVENTS.ready, (v1: unknown) => connect(v1)));
  plugin.registerEvent(workspace.on(PAGEWISE_EVENTS.unload, () => release()));
  plugin.register(release);
  workspace.trigger(PAGEWISE_EVENTS.request);
}

function isPagewiseApi(value: unknown): value is PagewiseApi {
  if (typeof value !== "object" || value === null) return false;
  const api = value as Record<string, unknown>;
  return api.version === 1 && typeof api.registerToolbarItem === "function" && typeof api.refreshToolbar === "function";
}
