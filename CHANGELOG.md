# Changelog

What's new in each release of Pagewise. The newest release comes first.

## 0.39.2

### Fixed

- The underline on links inside highlighted text now uses plain CSS that every supported version of Obsidian draws in full.

## 0.39.1

A tidy-up of Pagewise's stylesheet, so it sits better alongside themes and snippets.

### Changed

- Linked mention cards now fill two columns side by side, each card going to the shorter column, so the columns end at about the same height.
- Pagewise's styles no longer force their way past your theme.
- In Reading view, a paginated note now ends with its last page, without the half screen of empty space Obsidian adds below a note.

### Fixed

- A link inside highlighted text now takes the text color with an underline, so it stays easy to read on every highlight color, in dark mode too.
- Building Pagewise from a fresh copy of its code no longer changes the lockfile.

## 0.39.0

Pagewise's first public release. Thanks for trying it.

### New

- Reading view lays out a note as pages, with page breaks and page numbers. Pick A4, A5, US Letter or US Legal, and set your own margins.
- A document toolbar with Back and Forward, headings, lists, bold, italic, highlight in six colors, links, tables and images.
- Add any command as a toolbar button, hide the buttons you never use, and pick from ready-made buttons for nine popular plugins.
- Properties move to the sidebar or fold away on the page, as you prefer.
- Callouts and linked mentions show as tidy cards on paginated notes.
- With Home Cards installed, a Background button paints the space around your pages with Home Cards' patterns.
- With Style Settings installed, choose the colors of the sheets, the background, the cards and the page numbers.
- Other plugins can add buttons to the toolbar. The [toolbar guide](https://github.com/ttangents/obsidian-pagewise/blob/main/docs/TOOLBAR-API.md) shows how.
