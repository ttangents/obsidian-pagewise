import type { EventRef, Events } from "obsidian";
import { READY_EVENT, REQUEST_EVENT, UNLOAD_EVENT, type PagewiseApi } from "./extensionApi";

/**
 * Pagewise's side of the handshake shared by this family of plugins: it announces the API on the workspace's public event bus
 * once the API is usable and on every request, and announces its unload first thing
 * on unload. Any load order connects: a consumer that loaded first hears the ready
 * event, and one that loads later triggers the request.
 *
 * A breaking version would be passed as a further argument, oldest first:
 * `trigger(READY_EVENT, v1, v2)`. Version 1 stays the first argument.
 */
export class ApiAnnouncer {
  private live = false;

  constructor(
    private readonly bus: Events,
    private readonly api: PagewiseApi
  ) {}

  /** Answers requests while the API is live. The caller registers the reference with registerEvent. */
  listen(): EventRef {
    return this.bus.on(REQUEST_EVENT, () => {
      if (this.live) this.announce();
    });
  }

  /** The API is usable: tell every listener. */
  ready(): void {
    this.live = true;
    this.announce();
  }

  /** Pagewise is unloading: tell every listener before the API turns inert. */
  unload(): void {
    this.live = false;
    this.bus.trigger(UNLOAD_EVENT);
  }

  private announce(): void {
    this.bus.trigger(READY_EVENT, this.api);
  }
}
