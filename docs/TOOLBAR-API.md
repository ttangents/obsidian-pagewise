# Add your buttons to Pagewise's toolbar

Pagewise puts a document toolbar at the top of paginated notes, and your plugin is welcome on it. This guide shows you how to add a button, a menu or an on-and-off toggle, how to show progress on a button, and what Pagewise promises in return.

Three things make it safe to try:

- Your plugin never imports Pagewise. It builds and runs the same whether Pagewise is installed, turned off, or turned on again later.
- Pagewise guards every call into your code. If your button throws an error, Pagewise logs a warning and the rest of the toolbar keeps working.
- Pagewise versions the interface. Version 1 only ever grows, so a button you write today keeps working.

## Quick start

1. Copy [`api/pagewise-api.ts`](../api/pagewise-api.ts) into your plugin's source folder. It holds the types and a helper called `connectPagewise`, and it depends only on the `obsidian` package. It carries the MIT No Attribution license, so you can copy it with or without credit.
2. Call `connectPagewise` once in your plugin's `onload`.
3. Register your buttons inside it, and return the function `registerToolbarItem` gives you back.

```ts
import { Notice, Plugin } from "obsidian";
import { connectPagewise } from "./pagewise-api";

export default class WordCountPlugin extends Plugin {
  onload(): void {
    connectPagewise(this, (pagewise) =>
      pagewise.registerToolbarItem({
        id: "word-count:count",
        label: "Count words",
        icon: "hash",
        onClick: ({ editor }) => {
          new Notice(`${editor.getValue().split(/\s+/).filter(Boolean).length} words`);
        },
      })
    );
  }
}
```

That is the whole connection. The helper finds Pagewise whether it loaded before or after your plugin. It adds your button again after Pagewise reloads, and it removes the button when Pagewise turns off or your plugin unloads.

To add several buttons, register each one and return a single function that removes them all:

```ts
connectPagewise(this, (pagewise) => {
  const removers = [
    pagewise.registerToolbarItem(first),
    pagewise.registerToolbarItem(second),
  ];
  return () => removers.forEach((remove) => remove());
});
```

## Every button has these

| Field | What it is |
|---|---|
| `id` | A name no other button uses. By convention, your plugin's id, a colon, then a short name: `word-count:count`. Registering the same id again replaces the button in place. |
| `label` | The button's tooltip and its name for screen readers, in sentence case: "Count words". |
| `icon` | The name of a [Lucide](https://lucide.dev) icon that Obsidian ships, such as `hash` or `sparkles`. If Obsidian does not know the name, the button shows a puzzle piece, which is a handy hint while you develop. |

## Three kinds of button

### A plain button

Give it an `onClick`. It may return a promise.

```ts
{
  id: "my-plugin:tidy",
  label: "Tidy this note",
  icon: "sparkles",
  onClick: async ({ file }) => {
    if (file) await tidy(file);
  },
}
```

### A menu

Give it a `menu` instead of an `onClick`. Pagewise hands you an Obsidian `Menu` to fill, and opens it under the button.

```ts
{
  id: "my-plugin:insert",
  label: "Insert a snippet",
  icon: "text-cursor-input",
  menu: (menu, { editor }) => {
    menu.addItem((item) => item.setTitle("Today's date").setIcon("calendar").onClick(() => {
      editor.replaceSelection(new Date().toISOString().slice(0, 10));
    }));
    menu.addItem((item) => item.setTitle("A divider").setIcon("minus").onClick(() => {
      editor.replaceSelection("\n---\n");
    }));
  },
}
```

### A toggle

Give it an `onClick` and an `isActive`. The button looks pressed while `isActive` returns true. Call `refreshToolbar()` after you change your state, so every toolbar shows the new look.

```ts
let focusMode = false;

connectPagewise(this, (pagewise) =>
  pagewise.registerToolbarItem({
    id: "my-plugin:focus",
    label: "Focus mode",
    icon: "focus",
    onClick: () => {
      focusMode = !focusMode;
      document.body.toggleClass("my-plugin-focus", focusMode);
      pagewise.refreshToolbar();
    },
    isActive: () => focusMode,
  })
);
```

## Show a button only where it helps

- `isVisible` returns false to hide the button on a pane, for example on notes outside a folder or on files that are not Markdown.
- `readingView: true` keeps the button in Reading view too. Without it, Pagewise shows your button in Live Preview and Source mode only, because most buttons edit text.

```ts
{
  id: "my-plugin:project-status",
  label: "Project status",
  icon: "kanban",
  readingView: true,
  isVisible: ({ file }) => file?.path.startsWith("Projects/") ?? false,
  onClick: ({ file }) => showStatus(file),
}
```

## Badges: a progress ring or a dot

A button can wear a small badge:

- `{ kind: "progress", value: 0.4 }` draws a ring around the icon that fills from 0 to 1. Leave out `value` while you don't know the total, and the ring turns instead.
- `{ kind: "dot" }` adds a small dot in the accent color, for "something here needs a look".
- `null` shows no badge.

Add a `label`, and it joins the button's tooltip, such as "4 of 11 synced".

```ts
{
  id: "my-plugin:sync",
  label: "Sync this note",
  icon: "refresh-cw",
  onClick: ({ file }) => startSync(file),
  badge: ({ file }) => {
    const job = jobFor(file);
    if (!job) return null;
    return { kind: "progress", value: job.done / job.total, label: `${job.done} of ${job.total} synced` };
  },
}
```

Call `refreshToolbar()` whenever the progress changes.

## What your callbacks receive

Every callback gets the pane it acts on:

| Field | What it holds |
|---|---|
| `view` | The `MarkdownView` the toolbar belongs to |
| `file` | The note in that view, or `null` |
| `editor` | The view's `Editor` |
| `mode` | `"source"` for Live Preview and Source mode, `"preview"` for Reading view |

Before it calls `onClick` or `menu`, Pagewise makes that pane the active one. So an Obsidian command you run from your button acts on the right note, even with several notes open side by side.

`isVisible`, `isActive`, `badge` and `menu` need to answer straight away. Pagewise treats a promise from them as a failure.

## Keep your buttons up to date

Pagewise asks your `isVisible`, `isActive` and `badge` again whenever the active note, the view mode or the pane size changes. When your own state changes, call `refreshToolbar()` and every toolbar asks again.

Pagewise keeps its own copy of each button, so editing your object afterward has no effect. To change a label or an icon, register the button again with the same id.

## Where your buttons appear

Buttons from other plugins sit together in the toolbar's last section, after the reader's own command buttons, in the order your plugins registered them. They appear on every toolbar Pagewise shows: on paginated notes, or on all notes if the reader chose that. On a narrow pane they move into the More menu before any other control, the last one first. A toggle shows a check mark there.

Readers stay in charge. Settings → Pagewise → Added by other plugins lists your buttons by label, and the reader can switch any of them off.

## Pagewise's promises

For version 1, Pagewise keeps these promises:

1. `registerToolbarItem` never throws. For a malformed button, Pagewise logs one warning that names the problem and returns a remover that does nothing.
2. Pagewise copies your button when you register it. Registering the same id again replaces it in place, and the earlier remover then does nothing, so a reloaded plugin can never remove its own replacement.
3. Every callback runs inside a guard. For an error or a rejected promise, Pagewise logs one warning per button and callback, and carries on: a failing `isVisible` hides the button, a failing `isActive` shows it unpressed, and a menu with no entries stays closed.
4. After Pagewise unloads, the API does nothing, and removers are safe to call.
5. Version 1 only grows, by optional additions. A change that could break you would arrive as version 2, next to version 1.

## Connect by hand

The helper is the easy road. If you prefer to write the connection yourself, Pagewise speaks through three workspace events:

| Event | Who sends it | What it carries |
|---|---|---|
| `pagewise:ready` | Pagewise, once Obsidian's layout is ready, and again whenever asked | The API object for version 1 |
| `pagewise:request` | Your plugin, to ask Pagewise to send `pagewise:ready` again | Nothing |
| `pagewise:unload` | Pagewise, first thing when it unloads | Nothing |

Listen first, then ask, so the two plugins find each other in either load order:

```ts
import { Events, Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
  onload(): void {
    // Obsidian's Workspace type lists only its own events, so talk to it as plain Events.
    const bus: Events = this.app.workspace;
    this.registerEvent(bus.on("pagewise:ready", (api: unknown) => this.attach(api)));
    this.registerEvent(bus.on("pagewise:unload", () => this.detach()));
    this.register(() => this.detach());
    bus.trigger("pagewise:request");
  }

  private attach(api: unknown): void {
    // Check the version and methods, then register your buttons.
  }

  private detach(): void {
    // Call your removers, and forget the API.
  }
}
```

In `attach`, check that `version` is 1 and that `registerToolbarItem` and `refreshToolbar` are functions before you use them. Every `pagewise:ready` carries the same object until Pagewise reloads, so if you already hold that object, you can skip registering again. If an installed Pagewise offers a version you don't support, say so once where your button would have been, so readers know to update.

## Try it out

- Turn Pagewise off and on in Settings → Community plugins. Your button should leave and come back.
- Reload your own plugin with Pagewise running, and again with Pagewise off.
- Narrow the pane until your button moves into More.
- Throw an error from your `onClick` on purpose. You should see one warning in the console and a working toolbar.

## A plugin already on the toolbar

- [Home Cards](https://community.obsidian.md/plugins/home-cards) adds "Open Home Cards page".

Something missing, or an idea for the toolbar? [Open an issue](https://github.com/ttangents/obsidian-pagewise/issues). I'd love to hear what you build.
