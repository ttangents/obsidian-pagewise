import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EventRef } from "obsidian";
import { HOME_CARDS_EVENTS, HomeCardsBackgrounds, type HomeCardsApi, type HomeCardsBackground } from "../src/partners/homeCards";

/** Home Cards' contract as Pagewise consumes it; Home Cards' own tests pin the same literals. */
const contract = JSON.parse(readFileSync("test/contract/home-cards-api.json", "utf8")) as {
  version: number;
  events: Record<string, string>;
  methods: string[];
};

class FakeBus {
  private readonly listeners = new Map<string, Set<(...data: unknown[]) => unknown>>();
  on(name: string, callback: (...data: unknown[]) => unknown): EventRef {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(callback);
    return { name, callback } as unknown as EventRef;
  }
  trigger(name: string, ...data: unknown[]): void {
    [...(this.listeners.get(name) ?? [])].forEach((callback) => callback(...data));
  }
}

const leaves: HomeCardsBackground = {
  id: "leaves",
  label: "Leaves",
  light: "data:image/webp;base64,AAAA",
  dark: "data:image/webp;base64,BBBB",
  veil: { light: 0.9, dark: 0.9 },
};

/** A stand-in for Home Cards: announces its API when asked, and on load. */
function homeCards(bus: FakeBus, list: HomeCardsBackground[] = [leaves]) {
  const api: HomeCardsApi = Object.freeze({ version: 1 as const, backgrounds: () => list });
  let live = false;
  bus.on(HOME_CARDS_EVENTS.request, () => {
    if (live) bus.trigger(HOME_CARDS_EVENTS.ready, api);
  });
  return {
    api,
    load: () => {
      live = true;
      bus.trigger(HOME_CARDS_EVENTS.ready, api);
    },
    unload: () => {
      live = false;
      bus.trigger(HOME_CARDS_EVENTS.unload);
    },
  };
}

function pagewise(bus: FakeBus, warnings: string[] = []) {
  let changes = 0;
  const backgrounds = new HomeCardsBackgrounds(bus, () => changes++, (message) => warnings.push(message));
  backgrounds.listen();
  backgrounds.request();
  return { backgrounds, changes: () => changes };
}

test("the event names match the contract fixture", () => {
  assert.equal(contract.version, 1);
  assert.deepEqual(HOME_CARDS_EVENTS, contract.events);
  assert.deepEqual(contract.methods, ["backgrounds"]);
});

test("connects in either load order, and Home Cards leaving takes the patterns with it", () => {
  for (const order of ["home cards first", "pagewise first"]) {
    const bus = new FakeBus();
    const provider = homeCards(bus);
    if (order === "home cards first") provider.load();
    const consumer = pagewise(bus);
    if (order === "pagewise first") {
      assert.equal(consumer.backgrounds.status, "absent", order);
      provider.load();
    }
    assert.equal(consumer.backgrounds.status, "available", order);
    assert.deepEqual(consumer.backgrounds.list().map((b) => b.id), ["leaves"], order);
    assert.equal(consumer.backgrounds.find("leaves")?.label, "Leaves");
    provider.unload();
    assert.equal(consumer.backgrounds.status, "absent", order);
    assert.equal(consumer.backgrounds.find("leaves"), null, order);
    provider.load();
    assert.equal(consumer.backgrounds.status, "available", `${order}: reload`);
  }
});

test("the same API announced again changes nothing; a change event re-reads the list", () => {
  const bus = new FakeBus();
  const list = [leaves];
  const provider = homeCards(bus, list);
  provider.load();
  const consumer = pagewise(bus);
  const after = consumer.changes();
  bus.trigger(HOME_CARDS_EVENTS.ready, provider.api);
  assert.equal(consumer.changes(), after);
  list.push({ ...leaves, id: "my-photo", label: "My photo" });
  bus.trigger(HOME_CARDS_EVENTS.changed);
  assert.deepEqual(consumer.backgrounds.list().map((b) => b.id), ["leaves", "my-photo"]);
});

test("an unknown version is present but incompatible, reported once", () => {
  const bus = new FakeBus();
  const warnings: string[] = [];
  const consumer = pagewise(bus, warnings);
  bus.trigger(HOME_CARDS_EVENTS.ready, { version: 2, backgrounds: () => [] });
  bus.trigger(HOME_CARDS_EVENTS.ready, null);
  assert.equal(consumer.backgrounds.status, "incompatible");
  assert.deepEqual(consumer.backgrounds.list(), []);
  assert.equal(warnings.length, 1);
});

test("a throwing Home Cards costs only the patterns", () => {
  const bus = new FakeBus();
  const warnings: string[] = [];
  const consumer = pagewise(bus, warnings);
  const failing = { version: 1, backgrounds: () => { throw new Error("boom"); } };
  assert.doesNotThrow(() => bus.trigger(HOME_CARDS_EVENTS.ready, failing));
  bus.trigger(HOME_CARDS_EVENTS.changed);
  assert.equal(consumer.backgrounds.status, "available");
  assert.deepEqual(consumer.backgrounds.list(), []);
  assert.equal(warnings.length, 1);
});
