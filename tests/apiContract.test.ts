import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EventRef, Events } from "obsidian";
import { ApiAnnouncer } from "../src/toolbar/apiEvents";
import { READY_EVENT, REQUEST_EVENT, UNLOAD_EVENT, type PagewiseApi } from "../src/toolbar/extensionApi";
import { ToolbarRegistry, createApi } from "../src/toolbar/extensionRegistry";

/** The checked-in contract consumers build against. A change here is a contract change. */
const contract = JSON.parse(readFileSync("tests/contract/pagewise-api.json", "utf8")) as {
  version: number;
  events: { ready: string; request: string; unload: string };
  methods: string[];
};

function api(): PagewiseApi {
  return createApi(new ToolbarRegistry(() => undefined), () => undefined);
}

test("the event names and the API's shape match the contract fixture", () => {
  assert.deepEqual({ ready: READY_EVENT, request: REQUEST_EVENT, unload: UNLOAD_EVENT }, contract.events);
  const shape = api();
  assert.equal(shape.version, contract.version);
  assert.deepEqual(Object.keys(shape).filter((key) => key !== "version").sort(), [...contract.methods].sort());
  contract.methods.forEach((method) => assert.equal(typeof (shape as unknown as Record<string, unknown>)[method], "function"));
});

/** A minimal stand-in for Obsidian's Events: on, offref and trigger. */
class FakeBus {
  private readonly listeners = new Map<string, Set<(...data: unknown[]) => unknown>>();

  on(name: string, callback: (...data: unknown[]) => unknown): EventRef {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(callback);
    return { name, callback } as unknown as EventRef;
  }

  offref(ref: EventRef): void {
    const { name, callback } = ref as unknown as { name: string; callback: (...data: unknown[]) => unknown };
    this.listeners.get(name)?.delete(callback);
  }

  trigger(name: string, ...data: unknown[]): void {
    [...(this.listeners.get(name) ?? [])].forEach((listener) => listener(...data));
  }

  asEvents(): Events {
    return this as unknown as Events;
  }
}

/** A consumer that follows the contract: listens, then requests, and keeps the API it last heard. */
function consumer(bus: FakeBus): { heard: unknown[]; current: () => unknown } {
  const heard: unknown[] = [];
  let current: unknown = null;
  bus.on(contract.events.ready, (announced) => {
    heard.push(announced);
    current = announced;
  });
  bus.on(contract.events.unload, () => {
    heard.push("unload");
    current = null;
  });
  bus.trigger(contract.events.request);
  return { heard, current: () => current };
}

/** Pagewise's side as main.ts wires it: listen in onload, ready once usable, unload first in onunload. */
function provider(bus: FakeBus): { announcer: ApiAnnouncer; api: PagewiseApi; ref: EventRef } {
  const provided = api();
  const announcer = new ApiAnnouncer(bus.asEvents(), provided);
  const ref = announcer.listen();
  announcer.ready();
  return { announcer, api: provided, ref };
}

test("provider first: a consumer that loads later gets the API by request", () => {
  const bus = new FakeBus();
  const { api: provided } = provider(bus);
  const { current } = consumer(bus);
  assert.equal(current(), provided);
});

test("consumer first: the consumer hears the ready event", () => {
  const bus = new FakeBus();
  const { heard, current } = consumer(bus);
  assert.deepEqual(heard, [], "nobody answers a request before Pagewise loads");
  const { api: provided } = provider(bus);
  assert.equal(current(), provided);
});

test("a request before the API is live goes unanswered", () => {
  const bus = new FakeBus();
  const announcer = new ApiAnnouncer(bus.asEvents(), api());
  announcer.listen();
  const { heard } = consumer(bus);
  assert.deepEqual(heard, []);
});

test("unload tells the consumer, and a later request goes unanswered", () => {
  const bus = new FakeBus();
  const { announcer, ref } = provider(bus);
  const { heard, current } = consumer(bus);
  announcer.unload();
  bus.offref(ref);
  assert.equal(current(), null);
  bus.trigger(contract.events.request);
  assert.equal(heard[heard.length - 1], "unload");
});

test("reload announces a new API object; a repeated request announces the same one", () => {
  const bus = new FakeBus();
  const first = provider(bus);
  const { heard, current } = consumer(bus);
  bus.trigger(contract.events.request);
  assert.equal(heard[0], heard[1], "same object on every request, so a consumer can skip re-registering");
  first.announcer.unload();
  bus.offref(first.ref);
  const second = provider(bus);
  assert.equal(current(), second.api);
  assert.notEqual(second.api, first.api);
});
