# Pagewise architecture

## Module map

| Folder / file | Owns |
|---|---|
| `main.ts` | Composition root. Builds components, registers Obsidian events, owns settings. The only module that knows about all the others. |
| `settings.ts` | Settings schema, defaults, and `normalizeSettings` (validation on load). No Obsidian imports. |
| `settingsTab.ts` | The settings UI. Depends on the `SettingsHost` interface, not on the plugin class. |
| `obsidianInternals.ts` | Every undocumented Obsidian API Pagewise uses, each behind a guarded accessor. |
| `workspace.ts` | Shared workspace queries. |
| `printGuard.ts` | Detects print and PDF export; brackets it with suspend and resume. |
| `pagination/` | `layoutEngine` (pure page-break math), `pageSizes` (pure geometry), `paginator` (writes spacers into one preview), `controller` (which panes are paginated, debounced layout, suspend and resume). |
| `properties/` | In-note Properties collapse, and the on-demand Properties sidebar toggle. |
| `tables/` | `tableModel` (pure Markdown table parse, transform, serialize) and `tableEditor` (finds the table under the cursor and writes edits back). |
| `toolbar/` | `noteToolbar` (lifecycle and DOM), `anchor` (placement and what triggers it), `menus` (menu plumbing), `formatMenus` and `tableMenu` (menu contents), `markdownActions` (editor edits), `icons` (icon registration and Lucide fallbacks). |
| `styles.css` | Sections in order: sheets (reading view, Live Preview), print, toolbar, Properties sidebar, linked-mention cards. |

## Rules

1. Only `obsidianInternals.ts` touches undocumented Obsidian APIs. When an Obsidian update breaks something, audit that file first.
2. Pure modules (`layoutEngine`, `pageSizes`, `settings`, `tableModel`) import nothing from Obsidian at runtime. Editor-level modules (`tableEditor`, `markdownActions`) depend on the `Editor` interface only. All of these are unit-tested.
3. Components do not import each other. `main.ts` connects them.
4. Every DOM change Pagewise makes is removed on unload: classes, spacers, toolbars, observers, and the geometry variables on `<body>`.
5. Formatting writes plain Markdown only. No HTML or CSS goes into notes.
6. During print and PDF export, Pagewise does no DOM work.

## Build and test

`npm run build` type-checks, runs the test suite (`npm test`, Node's built-in runner over `tests/`), then bundles `main.js`.
