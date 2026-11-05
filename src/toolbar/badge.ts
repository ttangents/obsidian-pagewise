import type { PagewiseToolbarBadge } from "./extensionApi";

/**
 * Draws an extension item's badge on its toolbar button: a ring around the icon
 * that fills with progress (or turns while the total is unknown), or a dot in the
 * accent colour. Colours come from Obsidian's variables in the stylesheet, so
 * every theme draws it. The labels and the key are pure and unit-tested.
 */

const BADGE_CLASS = "pagewise-toolbar-badge";

/** The button's accessible name with the badge's label after it. */
export function badgeLabel(label: string, badge: PagewiseToolbarBadge | null): string {
  return badge?.label ? `${label}: ${badge.label}` : label;
}

/** A short key for what the badge draws, so an unchanged badge is not redrawn on every refresh. */
export function badgeKey(badge: PagewiseToolbarBadge | null): string {
  if (!badge) return "";
  if (badge.kind === "dot") return "dot";
  return badge.value === undefined ? "progress:spin" : `progress:${Math.round(badge.value * 100)}`;
}

/**
 * Puts the badge on the button's icon, replaces a different one, or removes it for
 * null. A menu button holds its icon and a chevron side by side, so the badge sits
 * on the icon's own box there, never on the whole button.
 */
export function paintBadge(button: HTMLElement, badge: PagewiseToolbarBadge | null): void {
  const key = badgeKey(badge);
  if ((button.dataset.pagewiseBadge ?? "") === key) return;
  const host = button.querySelector<HTMLElement>(":scope > .pagewise-toolbar-icon") ?? button;
  host.querySelector(`:scope > .${BADGE_CLASS}`)?.remove();
  if (badge?.kind === "dot") dot(host);
  else if (badge) ring(host, badge.value);
  if (key) button.dataset.pagewiseBadge = key;
  else delete button.dataset.pagewiseBadge;
  host.classList.toggle("has-pagewise-badge", key !== "");
  // The stylesheet makes room for the ring by this class, as it cannot ask which badge the icon holds.
  host.classList.toggle("has-pagewise-progress", badge?.kind === "progress");
}

function dot(button: HTMLElement): void {
  button.createSpan({ cls: [BADGE_CLASS, "is-dot"], attr: { "aria-hidden": "true" } });
}

function ring(button: HTMLElement, value: number | undefined): void {
  const el = button.createSpan({ cls: [BADGE_CLASS, "is-progress", ...(value === undefined ? ["is-indeterminate"] : [])], attr: { "aria-hidden": "true" } });
  const svg = el.createSvg("svg", { attr: { viewBox: "0 0 24 24" } });
  const circle = (cls: string, dash?: string) =>
    svg.createSvg("circle", { cls, attr: { cx: "12", cy: "12", r: "10.5", pathLength: "100", ...(dash ? { "stroke-dasharray": dash } : {}) } });
  circle("pagewise-badge-track");
  circle("pagewise-badge-fill", value === undefined ? "25 75" : `${Math.round(value * 100)} 100`);
}
