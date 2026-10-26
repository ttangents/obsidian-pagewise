/** The line Pagewise draws under the linked-mention cards; nothing else uses this class. */
export const ALSO_LINKED_CLASS = "pagewise-also-linked";
/** How many notes the line shows before it folds the rest behind "N more". */
export const SHOWN_NOTES = 5;

/** One note in the line: its name as the card title shows it, and how to open it. */
export interface AlsoLinkedNote {
  name: string;
  open(event: MouseEvent | KeyboardEvent): void;
}

/**
 * How many of `total` notes the folded line shows. It folds only when that hides two
 * or more, so the line never offers "1 more" in place of the one name.
 */
export function shownWhenFolded(total: number): number {
  return total > SHOWN_NOTES + 1 ? SHOWN_NOTES : total;
}

/**
 * Draws the line of notes that link here only from their properties, right after
 * `anchor` (the linked-mentions list), as a row of pills in the style of Obsidian's
 * own property pills. Past `SHOWN_NOTES` the rest fold behind a "N more" pill.
 *
 * Calling it again with the same notes changes nothing, so an unfolded line stays
 * unfolded while Obsidian re-renders the cards. The line folds again only when the
 * pane moves to another note. An empty list removes the line.
 */
export function showAlsoLinked(anchor: HTMLElement, notePath: string, notes: readonly AlsoLinkedNote[]): void {
  const next = anchor.nextElementSibling;
  let line = next?.instanceOf(HTMLElement) && next.classList.contains(ALSO_LINKED_CLASS) ? next : null;
  if (notes.length === 0) {
    line?.remove();
    return;
  }
  const key = JSON.stringify(notes.map((note) => note.name));
  if (line?.dataset.notes === key && line.dataset.path === notePath) return;
  const unfolded = line?.dataset.path === notePath && line.classList.contains("is-unfolded");
  if (!line) {
    line = anchor.parentElement?.createDiv({ cls: ALSO_LINKED_CLASS }) ?? null;
    if (!line) return;
    anchor.after(line);
  }
  line.dataset.notes = key;
  line.dataset.path = notePath;
  draw(line, notes, unfolded);
}

/** Removes every line Pagewise drew under `root`. */
export function removeAlsoLinked(root: HTMLElement): void {
  root.querySelectorAll(`.${ALSO_LINKED_CLASS}`).forEach((line) => line.remove());
}

function draw(line: HTMLElement, notes: readonly AlsoLinkedNote[], unfolded: boolean): void {
  line.replaceChildren();
  line.toggleClass("is-unfolded", unfolded);
  line.createSpan({ cls: "pagewise-also-linked-label", text: "Linked from properties" });
  const list = line.createEl("ul", { cls: "pagewise-also-linked-list" });
  const shown = shownWhenFolded(notes.length);
  notes.forEach((note, index) => {
    const item = list.createEl("li", { cls: "pagewise-also-linked-item" });
    item.toggleClass("is-folded", index >= shown);
    const pill = item.createSpan({ cls: "pagewise-also-linked-note", text: note.name, attr: { role: "link", tabindex: "0" } });
    pill.addEventListener("click", (event) => note.open(event));
    onActivate(pill, ["Enter"], (event) => note.open(event));
  });
  const hidden = notes.length - shown;
  if (hidden === 0) return;
  const toggle = line.createSpan({ cls: "pagewise-also-linked-toggle", attr: { role: "button", tabindex: "0" } });
  const render = () => {
    const open = line.classList.contains("is-unfolded");
    toggle.setText(open ? "Show fewer" : `${hidden} more`);
    toggle.setAttr("aria-expanded", String(open));
  };
  const flip = () => {
    line.toggleClass("is-unfolded", !line.classList.contains("is-unfolded"));
    render();
  };
  toggle.addEventListener("click", flip);
  onActivate(toggle, ["Enter", " "], flip);
  render();
}

/** Runs `action` when one of `keys` is pressed on `el`, as a native control would. */
function onActivate(el: HTMLElement, keys: readonly string[], action: (event: KeyboardEvent) => void): void {
  el.addEventListener("keydown", (event) => {
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    action(event);
  });
}
