import { validateToolbarItem, type PagewiseApi, type PagewiseToolbarItem } from "./extensionApi";

type Warn = (message: string, detail?: unknown) => void;

/**
 * The toolbar items other plugins have registered, in registration order. The
 * registry never throws to a caller: a bad item is refused with a warning and a
 * no-op remover, and every call into an item goes through `call`, which turns an
 * exception into a fallback value and one warning per item and hook.
 */
export class ToolbarRegistry {
  private readonly entries = new Map<string, { item: PagewiseToolbarItem; token: object }>();
  private readonly listeners = new Set<() => void>();
  private readonly warned = new Set<string>();
  private closed = false;

  constructor(private readonly warn: Warn = (message, detail) => console.warn(message, detail ?? "")) {}

  /**
   * Adds or replaces an item; returns its remover, which only ever removes this
   * registration. Never throws: an item whose properties throw when read (a getter,
   * a revoked Proxy) is refused like any other malformed item.
   */
  register(input: unknown): () => void {
    try {
      return this.add(input);
    } catch (error) {
      this.warn("Pagewise: a toolbar item was not added because reading it failed.", error);
      return noop;
    }
  }

  private add(input: unknown): () => void {
    if (this.closed) return noop;
    const result = validateToolbarItem(input);
    if ("error" in result) {
      this.warn(`Pagewise: a toolbar item was not added because ${result.error}.`);
      return noop;
    }
    const token = {};
    this.entries.set(result.item.id, { item: result.item, token });
    this.changed();
    return () => {
      const entry = this.entries.get(result.item.id);
      if (!entry || entry.token !== token) return;
      this.entries.delete(result.item.id);
      this.changed();
    };
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  items(): PagewiseToolbarItem[] {
    return [...this.entries.values()].map((entry) => entry.item);
  }

  /**
   * Calls one of an item's callbacks; an exception or a rejected promise becomes
   * `fallback`. Only `onClick` may return a promise (`async`). A promise from any
   * other hook counts as a failure, since Pagewise needs its answer at once.
   */
  call<T>(id: string, hook: string, fn: () => T, fallback: T, async = false): T {
    try {
      const result = fn();
      if (isThenable(result)) {
        result.then(undefined, (error: unknown) => this.failed(id, hook, error));
        if (!async) {
          this.failed(id, hook, new Error(`${hook} returned a promise; it must answer at once`));
          return fallback;
        }
      }
      return result;
    } catch (error) {
      this.failed(id, hook, error);
      return fallback;
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** On unload: drops every item and refuses new ones, so stale callers do nothing. */
  close(): void {
    this.closed = true;
    this.entries.clear();
    this.listeners.clear();
  }

  private failed(id: string, hook: string, error: unknown): void {
    const key = `${id}\u0000${hook}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(`Pagewise: toolbar item "${id}" failed in ${hook}; Pagewise carried on without it.`, error);
  }

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The API object other plugins receive: frozen, and inert once the registry closes. */
export function createApi(registry: ToolbarRegistry, refresh: () => void): PagewiseApi {
  return Object.freeze({
    version: 1 as const,
    registerToolbarItem: (item: PagewiseToolbarItem) => registry.register(item),
    refreshToolbar: () => {
      if (registry.isOpen) refresh();
    },
  });
}

function noop(): void {}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}
