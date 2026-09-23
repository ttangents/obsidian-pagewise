import { MarkdownView, type App } from "obsidian";

/** Every open Markdown pane, in workspace order. */
export function markdownViews(app: App): MarkdownView[] {
  return app.workspace
    .getLeavesOfType("markdown")
    .map((leaf) => leaf.view)
    .filter((view): view is MarkdownView => view instanceof MarkdownView);
}
