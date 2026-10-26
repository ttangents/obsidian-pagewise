import { test } from "node:test";
import assert from "node:assert/strict";
import { validateToolbarItem } from "../src/toolbar/extensionApi";
import { ToolbarRegistry, createApi } from "../src/toolbar/extensionRegistry";

const action = { id: "demo:hello", label: "Say hello", icon: "sparkles", onClick: () => undefined };

test("accepts an action, a menu, and a toggle", () => {
  assert.ok("item" in validateToolbarItem(action));
  assert.ok("item" in validateToolbarItem({ id: "demo:menu", label: "Menu", icon: "list", menu: () => undefined }));
  assert.ok("item" in validateToolbarItem({ ...action, isActive: () => true, readingView: true }));
});

test("refuses malformed items with a reason", () => {
  const refused = (input: unknown) => "error" in validateToolbarItem(input);
  assert.ok(refused(null));
  assert.ok(refused({ ...action, id: "" }));
  assert.ok(refused({ ...action, label: 7 }));
  assert.ok(refused({ ...action, icon: undefined }));
  assert.ok(refused({ id: "x", label: "x", icon: "x" }), "neither onClick nor menu");
  assert.ok(refused({ ...action, menu: () => undefined }), "both onClick and menu");
  assert.ok(refused({ id: "x", label: "x", icon: "x", menu: () => undefined, isActive: () => true }), "toggle menu");
  assert.ok(refused({ ...action, isVisible: "yes" }));
  assert.ok(refused({ ...action, readingView: "yes" }));
});

test("copies the item, so later changes by the caller do not leak in", () => {
  const input = { ...action };
  const result = validateToolbarItem(input);
  input.label = "Changed";
  assert.ok("item" in result && result.item.label === "Say hello");
});

function quietRegistry(): { registry: ToolbarRegistry; warnings: string[] } {
  const warnings: string[] = [];
  return { registry: new ToolbarRegistry((message) => warnings.push(message)), warnings };
}

test("registers, replaces by id in place, and removes", () => {
  const { registry } = quietRegistry();
  let changes = 0;
  registry.onChange(() => changes++);
  const removeFirst = registry.register(action);
  registry.register({ ...action, id: "demo:other" });
  registry.register({ ...action, label: "Hello again" });
  assert.deepEqual(registry.items().map((item) => item.label), ["Hello again", "Say hello"]);
  removeFirst();
  assert.equal(registry.items().length, 2, "an old remover leaves its replacement alone");
  assert.equal(changes, 3);
});

test("a refused item warns and returns a harmless remover", () => {
  const { registry, warnings } = quietRegistry();
  const remove = registry.register({ id: "bad" });
  assert.doesNotThrow(remove);
  assert.equal(registry.items().length, 0);
  assert.equal(warnings.length, 1);
});

test("a throwing callback yields the fallback and warns once", () => {
  const { registry, warnings } = quietRegistry();
  const boom = () => {
    throw new Error("boom");
  };
  assert.equal(registry.call("demo:hello", "isVisible", boom, false), false);
  assert.equal(registry.call("demo:hello", "isVisible", boom, false), false);
  assert.equal(warnings.length, 1);
});

test("a rejected promise is caught and warned about", async () => {
  const { registry, warnings } = quietRegistry();
  registry.call("demo:hello", "onClick", () => Promise.reject(new Error("later")), undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warnings.length, 1);
});

test("the API is frozen, versioned, and inert after unload", () => {
  const { registry } = quietRegistry();
  let refreshes = 0;
  const api = createApi(registry, () => refreshes++);
  assert.equal(api.version, 1);
  assert.ok(Object.isFrozen(api));
  api.registerToolbarItem(action);
  api.refreshToolbar();
  registry.close();
  const remove = api.registerToolbarItem({ ...action, id: "demo:late" });
  api.refreshToolbar();
  assert.doesNotThrow(remove);
  assert.equal(registry.items().length, 0);
  assert.equal(refreshes, 1);
});
