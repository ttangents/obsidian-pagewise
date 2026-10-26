import { Style, inlineStyles } from "./inlineMarkdown";
import { DOM } from "../obsidianDom";

/** Every wrapper Pagewise adds to an excerpt carries this class, plus one class per style. */
const WRAP_CLASS = "pagewise-md";
const STYLE_CLASSES: readonly [number, string][] = [
  [Style.SYNTAX, "pagewise-md-syntax"],
  [Style.LINK, "pagewise-md-link"],
  [Style.BOLD, "pagewise-md-bold"],
  [Style.ITALIC, "pagewise-md-italic"],
  [Style.HIGHLIGHT, "pagewise-md-highlight"],
  [Style.STRIKE, "pagewise-md-strike"],
  [Style.CODE, "pagewise-md-code"],
];
/** Characters that can start any Markdown inlineStyles reads; text without them is left alone. */
const MAY_HOLD_MARKDOWN = /[[\]=*_~`\\>#]/;

/**
 * Wraps the Markdown markers and styled words of one excerpt. A link or highlight may
 * run across Obsidian's spans (the highlighted mention is its own span), so the text
 * is read as one string and the result applied node by node. Text already wrapped is
 * left alone, so running this again changes nothing.
 */
export function styleExcerpt(excerpt: HTMLElement): void {
  const nodes = textNodes(excerpt);
  const text = nodes.map((node) => node.data).join("");
  if (!MAY_HOLD_MARKDOWN.test(text)) return;
  const kinds = inlineStyles(text);
  if (!kinds.some(Boolean)) return;
  let offset = 0;
  nodes.forEach((node) => {
    const length = node.data.length;
    const slice = kinds.subarray(offset, offset + length);
    offset += length;
    if (!slice.some(Boolean)) return;
    const pieces: (string | HTMLElement)[] = [];
    let runStart = 0;
    for (let i = 1; i <= length; i++) {
      if (i < length && slice[i] === slice[runStart]) continue;
      const piece = node.data.slice(runStart, i);
      const kind = slice[runStart];
      if (kind === 0) {
        pieces.push(piece);
      } else {
        // Created inside the excerpt, so it belongs to the excerpt's window; replaceWith moves it into place.
        const classes = [WRAP_CLASS, ...STYLE_CLASSES.filter(([bit]) => kind & bit).map(([, name]) => name)];
        pieces.push(excerpt.createSpan({ cls: classes, text: piece }));
      }
      runStart = i;
    }
    node.replaceWith(...pieces);
  });
}

/** Puts every wrapped piece under `root` back as plain text, as Obsidian rendered it. */
export function unstyleExcerpts(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(`.${WRAP_CLASS}`).forEach((span) => {
    const parent = span.parentElement;
    span.replaceWith(span.ownerDocument.createTextNode(span.textContent ?? ""));
    parent?.normalize();
  });
}

/** The excerpt's text nodes in order, leaving out Obsidian's controls and anything already wrapped. */
function textNodes(excerpt: HTMLElement): Text[] {
  const walker = excerpt.ownerDocument.createTreeWalker(excerpt, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(`${DOM.resultHoverButton}, .${WRAP_CLASS}`)) continue;
    nodes.push(node as Text);
  }
  return nodes;
}
