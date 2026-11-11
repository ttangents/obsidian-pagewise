/**
 * The toolbar's keyboard model: one tab stop for the whole bar, and the arrow,
 * Home and End keys move it between the buttons that show. The palette's swatches
 * keep their own keyboard model, so only elements matching the selector count.
 */
export class RovingTabStop {
  constructor(
    private readonly root: HTMLElement,
    private readonly selector: string
  ) {}

  /** Makes the target the bar's one tab stop, when it is one of the bar's buttons. */
  set(target: EventTarget | null): void {
    if (!(target instanceof Node) || !target.instanceOf(HTMLElement) || !target.matches(this.selector)) return;
    this.buttons().forEach((button) => (button.tabIndex = button === target ? 0 : -1));
  }

  /** Keeps the bar reachable by Tab when its current tab stop is hidden. */
  ensure(): void {
    const visible = this.visible();
    if (!visible.some((button) => button.tabIndex === 0) && visible.length > 0) this.set(visible[0]);
  }

  /** Moves focus for the arrow, Home and End keys; other keys pass through. */
  onKeydown(event: KeyboardEvent): void {
    const buttons = this.visible();
    const index = buttons.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowRight" ? buttons[(index + 1) % buttons.length]
      : event.key === "ArrowLeft" ? buttons[(index - 1 + buttons.length) % buttons.length]
      : event.key === "Home" ? buttons[0]
      : event.key === "End" ? buttons[buttons.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    this.set(next);
    next.focus();
  }

  private buttons(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(this.selector));
  }

  private visible(): HTMLElement[] {
    return this.buttons().filter((button) => button.offsetParent !== null);
  }
}

/**
 * Where focus goes when the focused control leaves the bar. A control that moved
 * into More hands focus to More, where it now lives. Otherwise focus goes to the
 * nearest showing control in bar order, the one before it first, so it stays
 * where the person was working. Null when nothing shows. Pure, so it is unit-tested.
 */
export function focusDestination<T>(
  buttons: readonly T[],
  from: T,
  { isShown, movedToMore, more }: { isShown: (button: T) => boolean; movedToMore: (button: T) => boolean; more: T | null }
): T | null {
  if (more !== null && from !== more && movedToMore(from) && isShown(more)) return more;
  const index = buttons.indexOf(from);
  if (index < 0) return buttons.find(isShown) ?? null;
  for (let i = index - 1; i >= 0; i--) if (isShown(buttons[i])) return buttons[i];
  for (let i = index + 1; i < buttons.length; i++) if (isShown(buttons[i])) return buttons[i];
  return null;
}
