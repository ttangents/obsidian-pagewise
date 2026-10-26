# Pagewise

Pagewise shows an Obsidian note as paginated sheets, like a word processor. Reading view gets page breaks and page numbers; Live Preview and Source mode get the same sheet styling without page breaks. Pagewise also adds a document toolbar with Back and Forward, formatting and table menus, collapsible in-note Properties with an on-demand Properties sidebar, callouts and linked mentions drawn as cards, and patterned canvas backgrounds.

Pagewise works with every theme. It writes plain Markdown only and never puts HTML or CSS into notes. Turning it off removes every change it made to the page. PDF export and printing stay with Obsidian.

## Use it

- Run "Toggle paginated view for this note" from the command palette, or click the book icon in the ribbon.
- In settings, choose whether pagination applies to one note at a time or to all notes, the page size, margins, the gap between sheets, what happens to Properties, and whether callouts show as Pagewise cards or as your theme draws them.
- The toolbar shows on paginated notes, or on all notes if you choose. It starts with Back and Forward, which replace the pair in Obsidian's tab title bar on that pane, then the formatting controls, then the buttons you or other plugins added, each section set apart by a thin divider. Add any command from the command palette as a toolbar button, and hide any built-in control.

## Privacy

Pagewise makes no network requests, collects no data and needs no account.

## Toolbar API for other plugins

Other plugins can add buttons to Pagewise's toolbar through a small, versioned API. Pagewise publishes it through public workspace events only:

| Event | Sent by | Payload |
|---|---|---|
| `pagewise:ready` | Pagewise, once the API is usable and again on every request | The API object (version 1) |
| `pagewise:request` | Any plugin, to ask for `pagewise:ready` again | None |
| `pagewise:unload` | Pagewise, first thing when it unloads | None |

The API object is frozen and has `version: 1`, `registerToolbarItem(item)`, which returns a remover, and `refreshToolbar()`. After Pagewise unloads, the API does nothing. A plugin listens for `pagewise:ready` and `pagewise:unload` with `registerEvent`, then triggers `pagewise:request` in `onload`, so either load order connects.

The full contract, with its guarantees and an example, is `API.md` in the project's documents.

## Build

```sh
npm ci
npm run build
```

`npm run build` generates `styles.css` and the bundled background tiles, type-checks, runs ESLint with Obsidian's review rules and zero warnings allowed, runs the tests with Vitest, and bundles `main.js`. `npm test` runs the tests alone.

## Licence

MIT.
