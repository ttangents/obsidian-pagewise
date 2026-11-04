# Pagewise

Pagewise shows an Obsidian note as paginated sheets, like a word processor. Reading view gets page breaks and page numbers; Live Preview and Source mode get the same sheet styling without page breaks. Pagewise also adds a document toolbar with Back and Forward, formatting and table menus, collapsible in-note Properties with an on-demand Properties sidebar, and callouts and linked mentions drawn as cards.

Pagewise works with every theme. It writes plain Markdown only and never puts HTML or CSS into notes. Turning it off removes every change it made to the page. PDF export and printing stay with Obsidian.

## Use it

- Run "Toggle paginated view for this note" from the command palette, or click the book icon in the ribbon.
- In settings, choose whether pagination applies to one note at a time or to all notes, the page size, margins, the gap between sheets, what happens to Properties, and whether callouts show as Pagewise cards or as your theme draws them.
- The toolbar shows on paginated notes, or on all notes if you choose. It starts with Back and Forward, which replace the pair in Obsidian's tab title bar on that pane, then the formatting controls, then the buttons you or other plugins added, each section set apart by a thin divider. Add any command from the command palette as a toolbar button, and hide any built-in control. Right-click the toolbar to customize it.

## Works with your other plugins

- Suggested buttons. If you use Templater, Dataview, Tasks, Excalidraw, Longform, Linter, Citations, Pandoc or Better Export PDF, Pagewise's settings offer a ready-made toolbar button for the command you will reach for most, one click each. Only plugins you have enabled appear.
- Late-drawn content. Page breaks follow blocks that finish drawing after the note opens, such as Dataview and Tasks results, Mermaid diagrams, Excalidraw drawings and images.
- Home Cards. With [Home Cards](https://community.obsidian.md/plugins/home-cards) installed, a Background button on the toolbar paints the canvas around the sheets with any of Home Cards' patterns. Without Home Cards, Pagewise works fully and the canvas stays plain.
- Style Settings. With [Style Settings](https://github.com/mgmeyers/obsidian-style-settings), set the colour of the sheets, the canvas, the cards and the page numbers, or hide the page numbers. Anything you leave unchanged follows your theme.
- Your own plugin. Any plugin can add buttons to the toolbar. See "Toolbar API" below.

## Privacy

Pagewise makes no network requests, collects no data and needs no account.

## Toolbar API

Other plugins add buttons to Pagewise's toolbar through a small, versioned API that Pagewise publishes on public workspace events. Your plugin never imports Pagewise and works unchanged when Pagewise is absent.

The quickest route is to copy [`api/pagewise-api.ts`](api/pagewise-api.ts) into your plugin. It holds the types and `connectPagewise`, which handles either load order, Pagewise being reloaded or turned off, and an incompatible version:

```ts
import { Plugin } from "obsidian";
import { connectPagewise } from "./pagewise-api";

export default class MyPlugin extends Plugin {
  onload(): void {
    connectPagewise(this, (pagewise) =>
      // Return the remover; the helper calls it whenever the connection ends.
      pagewise.registerToolbarItem({
        id: "my-plugin:word-count",
        label: "Word count",
        icon: "hash",
        onClick: ({ editor }) => console.log(editor.getValue().split(/\s+/).length),
      })
    );
  }
}
```

What an item can be:

| Kind | Fields | Behaviour |
|---|---|---|
| Action | `onClick` | Runs when pressed; may return a promise |
| Menu | `menu` | Fills an Obsidian menu that opens under the button |
| Toggle | `onClick` and `isActive` | Shows pressed while `isActive` returns true |

Every item has `id` (unique; by convention `<plugin-id>:<name>`), `label` (the accessible name and tooltip, in sentence case) and `icon` (a Lucide name Obsidian ships). Optional: `isVisible` to hide the button on some notes, `readingView: true` to keep it in Reading view, and `badge` for a progress ring or an attention dot. Every callback receives `{ view, file, editor, mode }` for the pane it acts on, and Pagewise makes that pane active first, so commands act on the right note. Call `refreshToolbar()` after your own state changes.

Pagewise keeps these promises for version 1:

1. `registerToolbarItem` never throws. A malformed item logs one warning and returns a remover that does nothing.
2. Pagewise copies the item when you register it; register again to change it. Registering an id again replaces the item in place.
3. Every callback runs inside a guard. An exception costs only your button, with one warning.
4. After Pagewise unloads, the API does nothing and removers are safe to call.
5. Version 1 only grows by optional additions. A breaking change would arrive as version 2 beside version 1.

The events, if you would rather connect by hand:

| Event | Sent by | Payload |
|---|---|---|
| `pagewise:ready` | Pagewise, once the API is usable and again on every request | The API object (version 1) |
| `pagewise:request` | Any plugin, to ask for `pagewise:ready` again | None |
| `pagewise:unload` | Pagewise, first thing when it unloads | None |

## Build

```sh
npm ci
npm run build
```

`npm run build` generates `styles.css`, type-checks, runs ESLint with Obsidian's review rules and zero warnings allowed, runs the tests with Vitest, and bundles `main.js`. `npm test` runs the tests alone.

## Licence

MIT. You may copy `api/pagewise-api.ts` into your own plugin without attribution.
