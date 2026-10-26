/**
 * How many of `total` items a folded list shows when it shows `limit`. A list folds
 * only when that hides two or more items, so it never offers "1 more" in place of
 * the one item.
 */
export function shownWhenFolded(total: number, limit: number): number {
  return total > limit + 1 ? limit : total;
}

/** What a fold toggle shows and reports. */
export interface FoldOptions {
  /** The text while folded, for example "11 more". */
  foldedText: string;
  unfolded: boolean;
  onChange(unfolded: boolean): void;
}

/**
 * Adds the dashed pill that unfolds a list ("11 more") and folds it again ("Show
 * fewer"). It acts like a button for the mouse, Enter and Space, and reports its
 * state to screen readers with aria-expanded.
 */
export function addFoldToggle(parent: HTMLElement, options: FoldOptions): HTMLElement {
  let unfolded = options.unfolded;
  const toggle = parent.createSpan({ cls: "pagewise-fold-toggle", attr: { role: "button", tabindex: "0" } });
  const render = () => {
    toggle.setText(unfolded ? "Show fewer" : options.foldedText);
    toggle.setAttr("aria-expanded", String(unfolded));
  };
  const flip = () => {
    unfolded = !unfolded;
    render();
    options.onChange(unfolded);
  };
  toggle.addEventListener("click", flip);
  onKeys(toggle, ["Enter", " "], flip);
  render();
  return toggle;
}

/** Runs `action` when one of `keys` is pressed on `el`, as a native control would. */
export function onKeys(el: HTMLElement, keys: readonly string[], action: (event: KeyboardEvent) => void): void {
  el.addEventListener("keydown", (event) => {
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    action(event);
  });
}
