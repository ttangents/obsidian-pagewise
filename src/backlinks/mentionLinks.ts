import { CharKind, wikilinkKinds } from "./wikilinkSyntax";

const MATCH_SELECTOR = ".search-result-file-match";
const SYNTAX_CLASS = "pagewise-link-syntax";
const LINK_CLASS = "pagewise-link-text";
/** The "more context" controls Obsidian puts inside each excerpt. */
const SKIP_SELECTOR = ".search-result-hover-button";

/**
 * Shows wikilinks in the linked-mention cards of paginated panes as their names, with
 * the brackets hidden. Obsidian renders the excerpts as raw Markdown and re-renders
 * them as the list scrolls or expands, so a MutationObserver on each pane's mentions
 * panel restyles every excerpt it adds.
 *
 * The excerpt text stays intact: the syntax is wrapped in a hidden span and the link
 * words in a styled one, so removing the wrappers restores Obsidian's own rendering.
 */
export class MentionLinks {
  private readonly watched = new Map<HTMLElement, MutationObserver>();

  /** Watches the mentions panels of these panes and releases every other one. */
  sync(paneRoots: readonly HTMLElement[]): void {
    const current = new Set<HTMLElement>();
    paneRoots.forEach((root) =>
      root.querySelectorAll<HTMLElement>(".embedded-backlinks").forEach((panel) => current.add(panel))
    );
    this.watched.forEach((observer, panel) => {
      if (current.has(panel) && panel.isConnected) return;
      observer.disconnect();
      this.watched.delete(panel);
      restore(panel);
    });
    current.forEach((panel) => {
      if (this.watched.has(panel)) return;
      const Observer = panel.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer((records) => records.forEach((record) => this.onMutation(record)));
      observer.observe(panel, { childList: true, subtree: true });
      this.watched.set(panel, observer);
      panel.querySelectorAll<HTMLElement>(MATCH_SELECTOR).forEach(styleExcerpt);
    });
  }

  dispose(): void {
    this.watched.forEach((observer, panel) => {
      observer.disconnect();
      restore(panel);
    });
    this.watched.clear();
  }

  private onMutation(record: MutationRecord): void {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    const enclosing = target?.closest<HTMLElement>(MATCH_SELECTOR);
    if (enclosing) {
      styleExcerpt(enclosing);
      return;
    }
    record.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(MATCH_SELECTOR)) styleExcerpt(node as HTMLElement);
      node.querySelectorAll<HTMLElement>(MATCH_SELECTOR).forEach(styleExcerpt);
    });
  }
}

/**
 * Wraps the wikilink syntax and link words of one excerpt. A link may run across
 * Obsidian's spans (the highlighted mention is its own span), so the excerpt's text
 * is read as one string and the result applied node by node. Text already wrapped is
 * left alone, so running this again changes nothing.
 */
function styleExcerpt(excerpt: HTMLElement): void {
  const nodes = textNodes(excerpt);
  const text = nodes.map((node) => node.data).join("");
  if (!text.includes("]]")) return;
  const kinds = wikilinkKinds(text);
  if (!kinds.some((kind) => kind !== CharKind.Text)) return;
  let offset = 0;
  nodes.forEach((node) => {
    const length = node.data.length;
    const slice = kinds.subarray(offset, offset + length);
    offset += length;
    if (slice.every((kind) => kind === CharKind.Text)) return;
    const doc = node.ownerDocument;
    const fragment = doc.createDocumentFragment();
    let runStart = 0;
    for (let i = 1; i <= length; i++) {
      if (i < length && slice[i] === slice[runStart]) continue;
      const piece = node.data.slice(runStart, i);
      const kind = slice[runStart];
      if (kind === CharKind.Text) {
        fragment.append(doc.createTextNode(piece));
      } else {
        const span = doc.createElement("span");
        span.className = kind === CharKind.Syntax ? SYNTAX_CLASS : LINK_CLASS;
        span.textContent = piece;
        fragment.append(span);
      }
      runStart = i;
    }
    node.replaceWith(fragment);
  });
}

/** The excerpt's text nodes in order, leaving out Obsidian's controls and anything already wrapped. */
function textNodes(excerpt: HTMLElement): Text[] {
  const doc = excerpt.ownerDocument;
  const walker = doc.createTreeWalker(excerpt, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(`${SKIP_SELECTOR}, .${SYNTAX_CLASS}, .${LINK_CLASS}`)) continue;
    nodes.push(node as Text);
  }
  return nodes;
}

/** Puts every wrapped piece back as plain text, as Obsidian rendered it. */
function restore(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLElement>(`.${SYNTAX_CLASS}, .${LINK_CLASS}`).forEach((span) => {
    const parent = span.parentElement;
    span.replaceWith(span.ownerDocument.createTextNode(span.textContent ?? ""));
    parent?.normalize();
  });
}
