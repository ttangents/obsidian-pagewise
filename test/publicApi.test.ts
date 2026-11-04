import { test } from "vitest";
import assert from "node:assert/strict";
import type { EventRef } from "obsidian";
import * as Public from "../api/pagewise-api";
import type * as Internal from "../src/toolbar/extensionApi";
import { READY_EVENT, REQUEST_EVENT, UNLOAD_EVENT } from "../src/toolbar/extensionApi";
import { ToolbarRegistry, createApi } from "../src/toolbar/extensionRegistry";
import { ApiAnnouncer } from "../src/toolbar/apiEvents";

/**
 * Keeps api/pagewise-api.ts, the file other plugins copy, in step with the
 * contract in src/toolbar/extensionApi.ts, and runs its connect helper against
 * the real announcer and registry on a fake event bus.
 */

// Type-level equality: the type check of `build` fails if the public types drift.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const sameTypes: [
  Equal<Public.PagewiseToolbarItem, Internal.PagewiseToolbarItem>,
  Equal<Public.PagewiseToolbarContext, Internal.PagewiseToolbarContext>,
  Equal<Public.PagewiseToolbarBadge, Internal.PagewiseToolbarBadge>,
  Equal<Public.PagewiseApi, Internal.PagewiseApi>,
] = [true, true, true, true];

test("the public types and event names match the contract", () => {
  assert.deepEqual(sameTypes, [true, true, true, true]);
  assert.deepEqual(Public.PAGEWISE_EVENTS, { ready: READY_EVENT, request: REQUEST_EVENT, unload: UNLOAD_EVENT });
});

/** A minimal Obsidian Events bus plus a plugin whose unload runs its registered cleanups. */
function fakeWorld() {
  const handlers = new Map<string, Set<(...data: unknown[]) => unknown>>();
  const workspace = {
    on(name: string, callback: (...data: unknown[]) => unknown): EventRef {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(callback);
      return { name, callback } as unknown as EventRef;
    },
    offref(ref: EventRef) {
      const { name, callback } = ref as unknown as { name: string; callback: (...data: unknown[]) => unknown };
      handlers.get(name)?.delete(callback);
    },
    trigger(name: string, ...data: unknown[]) {
      [...(handlers.get(name) ?? [])].forEach((handler) => handler(...data));
    },
  };
  const consumer = () => {
    const refs: EventRef[] = [];
    const cleanups: (() => unknown)[] = [];
    return {
      app: { workspace },
      registerEvent: (ref: EventRef) => void refs.push(ref),
      register: (callback: () => unknown) => void cleanups.push(callback),
      unload: () => {
        refs.forEach((ref) => workspace.offref(ref));
        cleanups.forEach((cleanup) => cleanup());
      },
    };
  };
  const pagewise = () => {
    const registry = new ToolbarRegistry(() => undefined);
    const announcer = new ApiAnnouncer(workspace as never, createApi(registry, () => undefined));
    const ref = announcer.listen();
    return {
      registry,
      ready: () => announcer.ready(),
      unload: () => {
        announcer.unload();
        registry.close();
        workspace.offref(ref);
      },
    };
  };
  return { workspace, consumer, pagewise };
}

const item: Public.PagewiseToolbarItem = { id: "demo:go", label: "Go", icon: "play", onClick: () => undefined };

test("connects in either load order, survives a Pagewise reload, and cleans up on unload", () => {
  for (const order of ["pagewise first", "consumer first"]) {
    const world = fakeWorld();
    let provider = world.pagewise();
    if (order === "pagewise first") provider.ready();
    const plugin = world.consumer();
    Public.connectPagewise(plugin, (api) => api.registerToolbarItem(item));
    if (order === "consumer first") provider.ready();
    assert.deepEqual(provider.registry.items().map((i) => i.id), ["demo:go"], order);

    provider.unload();
    provider = world.pagewise();
    provider.ready();
    assert.deepEqual(provider.registry.items().map((i) => i.id), ["demo:go"], `${order}: after reload`);

    plugin.unload();
    assert.deepEqual(provider.registry.items(), [], `${order}: after the consumer unloads`);
  }
});

test("a repeated announcement of the same API registers once, and an incompatible one is reported once", () => {
  const world = fakeWorld();
  const provider = world.pagewise();
  provider.ready();
  const plugin = world.consumer();
  let attaches = 0;
  Public.connectPagewise(plugin, (api) => {
    attaches += 1;
    return api.registerToolbarItem(item);
  });
  world.workspace.trigger(REQUEST_EVENT);
  assert.equal(attaches, 1);

  let reports = 0;
  const other = world.consumer();
  Public.connectPagewise(other, () => undefined, () => reports++);
  world.workspace.trigger(READY_EVENT, { version: 2 });
  world.workspace.trigger(READY_EVENT, null);
  assert.equal(reports, 1);
});

test("a throwing attach or remover costs only the consumer's buttons", () => {
  const world = fakeWorld();
  const provider = world.pagewise();
  const plugin = world.consumer();
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    Public.connectPagewise(plugin, () => {
      throw new Error("boom");
    });
    provider.ready();
    const second = world.consumer();
    Public.connectPagewise(second, () => () => {
      throw new Error("remover");
    });
    assert.doesNotThrow(() => provider.unload());
    assert.doesNotThrow(() => second.unload());
  } finally {
    console.warn = warn;
  }
});
