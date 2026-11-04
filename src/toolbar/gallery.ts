/**
 * Suggested command buttons for popular community plugins: the commands a writer
 * reaches for while a note is open, each with an icon chosen for the toolbar. The
 * settings tab offers an entry only while its plugin provides the command and the
 * toolbar does not have it yet, so the list never names a plugin the user lacks.
 *
 * Pure data; the command ids come from each plugin's source and are checked by the
 * settings tab against Obsidian's command list before an entry shows.
 */

/** One suggested button: a command, its toolbar icon, and the plugin that provides it. */
export interface GalleryEntry {
  /** The command's full id, `<plugin-id>:<command-id>`. */
  commandId: string;
  /** The plugin's name as the community directory lists it. */
  plugin: string;
  /** What the button does, in sentence case. */
  label: string;
  /** A Lucide icon name Obsidian ships. */
  icon: string;
}

export const GALLERY: readonly GalleryEntry[] = [
  { commandId: "templater-obsidian:insert-templater", plugin: "Templater", label: "Insert template", icon: "layout-template" },
  { commandId: "dataview:dataview-force-refresh-views", plugin: "Dataview", label: "Refresh views and blocks", icon: "refresh-cw" },
  { commandId: "obsidian-tasks-plugin:edit-task", plugin: "Tasks", label: "Create or edit task", icon: "list-checks" },
  {
    commandId: "obsidian-excalidraw-plugin:excalidraw-autocreate-and-embed-new-tab",
    plugin: "Excalidraw",
    label: "New drawing, embedded here",
    icon: "pencil",
  },
  { commandId: "longform:longform-compile-current", plugin: "Longform", label: "Compile the current project", icon: "book-up" },
  { commandId: "obsidian-linter:lint-file", plugin: "Linter", label: "Lint this note", icon: "wand" },
  { commandId: "obsidian-citation-plugin:insert-markdown-citation", plugin: "Citations", label: "Insert citation", icon: "quote" },
  { commandId: "obsidian-pandoc:pandoc-export-docx", plugin: "Pandoc", label: "Export as Word document", icon: "file-text" },
  { commandId: "better-export-pdf:export-current-file-to-pdf", plugin: "Better Export PDF", label: "Export to PDF", icon: "file-down" },
];

/**
 * The entries to offer: those whose command an enabled plugin provides and that
 * the toolbar does not carry yet, in gallery order.
 */
export function availableSuggestions(
  gallery: readonly GalleryEntry[],
  hasCommand: (commandId: string) => boolean,
  onToolbar: readonly string[]
): GalleryEntry[] {
  const taken = new Set(onToolbar);
  return gallery.filter((entry) => !taken.has(entry.commandId) && hasCommand(entry.commandId));
}
