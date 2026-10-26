import type { ToggleScope } from "../settings";

/**
 * What the toggle scope asks of one pane after notes open, close or change. Pure, so
 * it is unit-tested. Each pane is judged by its own note: another pane opening, or
 * another plugin opening a tab, never changes a pane whose note stayed the same.
 */
export type NoteAction = "keep" | "activate" | "deactivate" | "relayout";

/**
 * @param paginated whether the pane shows the paginated view now
 * @param noteChanged whether the pane shows a different note from the one it was paginated for
 */
export function noteAction(scope: ToggleScope, globalEnabled: boolean, paginated: boolean, noteChanged: boolean): NoteAction {
  if (scope === "global") {
    if (!globalEnabled) return paginated ? "deactivate" : "keep";
    if (!paginated) return "activate";
    return noteChanged ? "relayout" : "keep";
  }
  // "This note only": pagination belongs to the note, so it ends when the pane's note is replaced.
  return paginated && noteChanged ? "deactivate" : "keep";
}
