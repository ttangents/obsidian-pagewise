/**
 * Every part of Obsidian's DOM and every undocumented view type Pagewise relies on,
 * in one place. Obsidian does not document these, and an update may rename or move
 * them; when one does, Pagewise loses that feature on the affected pane and nothing
 * else. Together with obsidianInternals.ts (undocumented methods), this file is the
 * list to audit after an Obsidian update.
 *
 * The stylesheet relies on the same contracts plus these, which it cannot import:
 * `.workspace-leaf-content[data-type="markdown"]`, `.view-content`,
 * `.markdown-preview-view`, `.markdown-source-view.mod-cm6 > .cm-editor > .cm-scroller > .cm-sizer`,
 * `.cm-contentContainer`, `.cm-content`, `.metadata-properties-heading`,
 * `.metadata-content`, `.metadata-properties`, `.metadata-add-button`,
 * `.backlink-pane` and the `.theme-dark` body class.
 */
export const DOM = {
  /** Reading view's sheet: the direct parent of the rendered sections (pagination). */
  previewSizer: ".markdown-preview-sizer",
  /** Reading view's placeholder for sections it has not rendered yet (pagination). */
  previewPusher: ".markdown-preview-pusher",
  /** Live Preview and Source mode's root inside a Markdown view (Properties collapse). */
  sourceView: ".markdown-source-view",
  /** The attribute on a Markdown view's container that names its mode (toolbar). */
  viewModeAttribute: "data-mode",
  /** The in-note Properties panel, its collapsed class and its fold indicator. */
  metadataContainer: ".metadata-container",
  collapsedClass: "is-collapsed",
  metadataIndicator: ".metadata-properties-heading .collapse-indicator",
  /** The core Properties view's type (Properties sidebar). */
  propertiesViewType: "file-properties",
  /** The linked-mentions panel under a note and its parts (mention footer). */
  embeddedBacklinks: ".embedded-backlinks",
  /** The first result list in that panel holds the linked mentions. */
  resultList: ".search-result-container",
  resultCard: ".search-result",
  resultTitle: ".search-result-file-title",
  resultTitleText: ".search-result-file-title .tree-item-inner",
  resultMatch: ".search-result-file-match",
  /** The "more context" controls inside an excerpt. */
  resultHoverButton: ".search-result-hover-button",
  /** Elements that own focus when an action opened them: modals, prompts, menus (toolbar focus). */
  focusOwners: ".modal-container, .prompt, .menu",
  /** PDF export's container, rendered in a hidden window (post-processor). */
  printContainer: ".print",
} as const;
