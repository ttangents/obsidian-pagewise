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

/** Puts the badge on the button, replaces a different one, or removes it for null. */
export function paintBadge(button: HTMLElement, badge: PagewiseToolbarBadge | null): void {
  const key = badgeKey(badge);
  if ((button.dataset.pagewiseBadge ?? "") === key) return;
  button.querySelector(`:scope > .${BADGE_CLASS}`)?.remove();
  if (badge?.kind === "dot") dot(button);
  else if (badge) ring(button, badge.value);
  if (key) button.dataset.pagewiseBadge = key;
  else delete button.dataset.pagewiseBadge;
  button.classList.toggle("has-pagewise-badge", key !== "");
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
