import { addFoldToggle, onKeys, shownWhenFolded } from "./fold";
import { addSection } from "./section";

/** How many notes the line shows before it folds the rest behind "N more". */
const SHOWN_PROPERTY_LINKS = 5;

/** One note in the line: the name it shows, and how to open it. */
export interface AlsoLinkedNote {
  name: string;
  open(event: MouseEvent | KeyboardEvent): void;
}

/**
 * Draws the "Linked from properties" section: a header like "Linked mentions", then
 * the notes that link here only from their properties as pills on one card, in the
 * style of Obsidian's property pills with the names in the link colour. Past
 * SHOWN_PROPERTY_LINKS the rest fold behind a "N more" pill. The pills form a list,
 * so a screen reader announces how many there are.
 */
export function renderAlsoLinked(
  parent: HTMLElement,
  notes: readonly AlsoLinkedNote[],
  fold: { unfolded: boolean; onChange(unfolded: boolean): void }
): void {
  if (notes.length === 0) return;
  const line = addSection(parent, "Linked from properties", notes.length).createDiv({ cls: "pagewise-also-linked" });
  line.toggleClass("is-unfolded", fold.unfolded);
  const list = line.createEl("ul", { cls: "pagewise-also-linked-list" });
  const shown = shownWhenFolded(notes.length, SHOWN_PROPERTY_LINKS);
  notes.forEach((note, index) => {
    const item = list.createEl("li", { cls: "pagewise-also-linked-item" });
    item.toggleClass("is-folded", index >= shown);
    const pill = item.createSpan({ cls: "pagewise-also-linked-note", text: note.name, attr: { role: "link", tabindex: "0" } });
    pill.addEventListener("click", (event) => note.open(event));
    onKeys(pill, ["Enter"], (event) => note.open(event));
  });
  const hidden = notes.length - shown;
  if (hidden === 0) return;
  addFoldToggle(line, {
    foldedText: `${hidden} more`,
    unfolded: fold.unfolded,
    onChange: (unfolded) => {
      line.toggleClass("is-unfolded", unfolded);
      fold.onChange(unfolded);
    },
  });
}
