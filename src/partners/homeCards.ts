import type { EventRef } from "obsidian";
import { readBackgrounds, type Background } from "../appearance/backgrounds";

/**
 * Pagewise's side of Home Cards' API (D29): the canvas patterns. Home Cards owns
 * the patterns and lends them; without Home Cards, Pagewise offers no Background
 * button and paints the plain canvas. The connection follows the handshake
 * shared by this family of plugins, and every
 * call into Home Cards is guarded, so a failure there costs only the patterns.
 */

/** Home Cards' workspace events. `changed` says its list of backgrounds changed. */
export const HOME_CARDS_EVENTS = {
  ready: "home-cards:ready",
  request: "home-cards:request",
  unload: "home-cards:unload",
  changed: "home-cards:changed",
} as const;

/** One background as Home Cards' API version 1 describes it. */
export interface HomeCardsBackground {
  id: string;
  label: string;
  /** Image URLs: inline images, or files Obsidian serves (`app://`). */
  light: string;
  dark: string;
  /** Home Cards' own veil for each theme, from 0 to 1. */
  veil: { light: number; dark: number };
}

/** The part of Home Cards' API version 1 Pagewise uses. */
export interface HomeCardsApi {
  readonly version: 1;
  /** The backgrounds Home Cards offers, in its picker's order. */
  backgrounds(): HomeCardsBackground[];
}

/** Where the partner stands: not installed, connected, or installed with an API this Pagewise cannot use. */
export type PartnerStatus = "absent" | "available" | "incompatible";

/** The part of Obsidian's workspace events the connection uses. */
export interface EventBus {
  on(name: string, callback: (...data: unknown[]) => unknown): EventRef;
  trigger(name: string, ...data: unknown[]): void;
}

type Warn = (message: string, detail?: unknown) => void;

/** Holds the backgrounds Home Cards currently lends, and says when they change. */
export class HomeCardsBackgrounds {
  private api: HomeCardsApi | null = null;
  private current: Background[] = [];
  private state: PartnerStatus = "absent";
  private warnedVersion = false;
  private warnedCall = false;

  constructor(
    private readonly bus: EventBus,
    private readonly onChange: () => void,
    private readonly warn: Warn = (message, detail) => console.warn(message, detail ?? "")
  ) {}

  /** Listens for Home Cards. The caller registers each reference with registerEvent, then calls request(). */
  listen(): EventRef[] {
    return [
      this.bus.on(HOME_CARDS_EVENTS.ready, (v1: unknown) => this.connect(v1)),
      this.bus.on(HOME_CARDS_EVENTS.unload, () => this.disconnect()),
      this.bus.on(HOME_CARDS_EVENTS.changed, () => {
        if (this.api) this.reload();
      }),
    ];
  }

  /** Asks Home Cards to announce itself, for the case where it loaded first. */
  request(): void {
    this.bus.trigger(HOME_CARDS_EVENTS.request);
  }

  get status(): PartnerStatus {
    return this.state;
  }

  /** The backgrounds on offer, in Home Cards' order; empty unless Home Cards is connected. */
  list(): readonly Background[] {
    return this.current;
  }

  /** The background with this id, or null when Home Cards does not offer it now. */
  find(id: string): Background | null {
    return this.current.find((background) => background.id === id) ?? null;
  }

  /** Forgets Home Cards without announcing a change: Pagewise is unloading. */
  dispose(): void {
    this.api = null;
    this.current = [];
    this.state = "absent";
  }

  private connect(announced: unknown): void {
    if (announced !== null && announced === this.api) return;
    if (!isHomeCardsApi(announced)) {
      this.api = null;
      this.current = [];
      this.state = "incompatible";
      if (!this.warnedVersion) {
        this.warnedVersion = true;
        this.warn("Pagewise: this version of Pagewise does not support the installed Home Cards, so backgrounds are off.");
      }
      this.onChange();
      return;
    }
    this.api = announced;
    this.state = "available";
    this.reload();
  }

  private disconnect(): void {
    if (this.state === "absent") return;
    this.api = null;
    this.current = [];
    this.state = "absent";
    this.onChange();
  }

  private reload(): void {
    const api = this.api;
    if (!api) return;
    let raw: unknown = [];
    try {
      raw = api.backgrounds();
    } catch (error) {
      if (!this.warnedCall) {
        this.warnedCall = true;
        this.warn("Pagewise: Home Cards could not list its backgrounds; Pagewise carried on without them.", error);
      }
    }
    this.current = readBackgrounds(raw);
    this.onChange();
  }
}

function isHomeCardsApi(value: unknown): value is HomeCardsApi {
  if (typeof value !== "object" || value === null) return false;
  const api = value as Record<string, unknown>;
  return api.version === 1 && typeof api.backgrounds === "function";
}
