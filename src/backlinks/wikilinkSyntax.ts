/**
 * Finds the Markdown syntax of wikilinks in a run of text: the brackets, the embed
 * mark, the target behind an alias, and a heading or block reference. Pure, so it is
 * unit-tested; mentionLinks.ts applies the result to the linked-mention cards.
 */

/** How one character of an excerpt is shown. */
export const CharKind = {
  Text: 0,
  /** Link syntax, hidden on the cards. */
  Syntax: 1,
  /** The words a link shows: its alias, or else its note name. */
  Link: 2,
} as const;

const WIKILINK = /(!?\[\[)([^[\]|#^\n]*)([#^][^[\]|\n]*)?(?:(\|)([^[\]\n]*))?(\]\])/g;

/**
 * One kind per character of `text`. A link cut short by the excerpt's "..." has no
 * closing brackets and stays as written.
 */
export function wikilinkKinds(text: string): Uint8Array {
  const kinds = new Uint8Array(text.length);
  for (const match of text.matchAll(WIKILINK)) {
    const [whole, open, target, subpath = "", pipe, alias] = match;
    const start = match.index ?? 0;
    const shown = pipe && alias.trim() ? "alias" : target.trim() ? "target" : null;
    if (!shown) continue;
    kinds.fill(CharKind.Syntax, start, start + whole.length);
    const targetStart = start + open.length;
    if (shown === "target") {
      kinds.fill(CharKind.Link, targetStart, targetStart + target.length);
    } else {
      const aliasStart = targetStart + target.length + subpath.length + 1;
      kinds.fill(CharKind.Link, aliasStart, aliasStart + alias.length);
    }
  }
  return kinds;
}
