import type { Editor } from "obsidian";

/**
 * Editor edits the toolbar performs itself, for formats Obsidian has no command for.
 * Each one writes plain Markdown only, never HTML. They depend on the Editor
 * interface alone, so tests drive them with a fake editor.
 */

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Sets the cursor line to the given heading level; picking its current level clears it. */
export function setHeading(editor: Editor, level: number): void {
  const lineNumber = editor.getCursor().line;
  const line = editor.getLine(lineNumber);
  const match = /^(#{1,6})\s+/.exec(line);
  const body = match ? line.slice(match[0].length) : line;
  const next = match?.[1].length === level ? body : `${"#".repeat(level)} ${body}`;
  editor.setLine(lineNumber, next);
  editor.setCursor({ line: lineNumber, ch: next.length });
}

/**
 * Inserts an Obsidian callout. Block form puts the marker on its own line with the
 * selection as quoted body lines; inline form is the one-line `> [!type] text` callout.
 */
export function insertCallout(editor: Editor, type: string, inline: boolean): void {
  const selection = editor.getSelection();
  const lead = onBlankLine(editor) ? "" : "\n\n";
  if (inline) {
    editor.replaceSelection(`${lead}> [!${type}] ${selection}`);
    return;
  }
  const body = selection
    ? selection
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    : "> ";
  editor.replaceSelection(`${lead}> [!${type}]\n${body}`);
}

/** Inserts a thematic break (---) on its own line at the cursor. */
export function insertSeparator(editor: Editor): void {
  editor.replaceSelection(onBlankLine(editor) ? "---\n" : "\n\n---\n");
}

function onBlankLine(editor: Editor): boolean {
  return editor.getLine(editor.getCursor().line).trim().length === 0;
}
