/**
 * Reads the inline Markdown in a run of excerpt text: wikilinks, Markdown links,
 * highlights, bold, italics, strikethrough, inline code and backslash escapes. Pure,
 * so it is unit-tested; mentionLinks.ts applies the result to the linked-mention cards.
 *
 * The result is one bitmask per character. Syntax characters (brackets, ==, **, the
 * target behind an alias) carry SYNTAX and are hidden; the rest carry the styles they
 * render with. Unclosed syntax, such as a link cut short by an excerpt's "...", stays
 * as written, as it does in Obsidian.
 */

export const Style = {
  SYNTAX: 1,
  LINK: 2,
  BOLD: 4,
  ITALIC: 8,
  HIGHLIGHT: 16,
  STRIKE: 32,
  CODE: 64,
} as const;

const WIKILINK = /(!?\[\[)([^[\]|#^\n]*)([#^][^[\]|\n]*)?(?:(\|)([^[\]\n]*))?(\]\])/g;
const MARKDOWN_LINK = /(!?\[)([^[\]\n]+)(\]\([^()\s]+(?:\s+"[^"\n]*")?\))/g;
const CODE = /(`+)([^`\n]+?)\1/g;
const ESCAPE = /\\([\\`*_=~[\]#|!])/g;

/** Paired delimiters, longest first, so ** is read before *. */
const EMPHASIS: readonly { pattern: RegExp; style: number }[] = [
  { pattern: /==(?=\S)([^\n]*?\S)==/g, style: Style.HIGHLIGHT },
  { pattern: /~~(?=\S)([^\n]*?\S)~~/g, style: Style.STRIKE },
  { pattern: /\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g, style: Style.BOLD },
  { pattern: /(?<![\p{L}\p{N}_])__(?=[^\s_])([^\n]*?[^\s_])__(?![\p{L}\p{N}_])/gu, style: Style.BOLD },
  { pattern: /(?<![*\\])\*(?=[^\s*])([^\n*]*?[^\s*\\])\*(?!\*)/g, style: Style.ITALIC },
  { pattern: /(?<![\p{L}\p{N}_\\])_(?=[^\s_])([^\n_]*?[^\s_\\])_(?![\p{L}\p{N}_])/gu, style: Style.ITALIC },
];

export function inlineStyles(text: string): Uint8Array {
  const styles = new Uint8Array(text.length);
  /** Characters already claimed as code, link syntax or escapes: no further reading. */
  const locked = new Uint8Array(text.length);
  const free = (start: number, end: number) => !locked.subarray(start, end).some(Boolean);
  const hide = (start: number, end: number) => {
    styles.fill(Style.SYNTAX, start, end);
    locked.fill(1, start, end);
  };

  for (const match of text.matchAll(ESCAPE)) {
    const start = match.index ?? 0;
    if (!free(start, start + 2)) continue;
    hide(start, start + 1);
    locked[start + 1] = 1;
  }

  for (const match of text.matchAll(CODE)) {
    const start = match.index ?? 0;
    const [whole, ticks] = match;
    if (!free(start, start + whole.length)) continue;
    hide(start, start + ticks.length);
    hide(start + whole.length - ticks.length, start + whole.length);
    styles.fill(Style.CODE, start + ticks.length, start + whole.length - ticks.length);
    locked.fill(1, start, start + whole.length);
  }

  for (const match of text.matchAll(WIKILINK)) {
    const [whole, open, target, subpath = "", pipe, alias] = match;
    const start = match.index ?? 0;
    if (!free(start, start + whole.length)) continue;
    const showAlias = !!pipe && alias.trim() !== "";
    if (!showAlias && target.trim() === "") continue;
    const targetStart = start + open.length;
    const shownStart = showAlias ? targetStart + target.length + subpath.length + 1 : targetStart;
    const shownEnd = showAlias ? shownStart + alias.length : targetStart + target.length;
    hide(start, shownStart);
    hide(shownEnd, start + whole.length);
    styles.fill(Style.LINK, shownStart, shownEnd);
    locked.fill(1, shownStart, shownEnd);
  }

  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole, open, label] = match;
    const start = match.index ?? 0;
    if (!free(start, start + whole.length)) continue;
    const labelStart = start + open.length;
    hide(start, labelStart);
    hide(labelStart + label.length, start + whole.length);
    // The label may itself hold emphasis, so it stays open to the next pass.
    for (let i = labelStart; i < labelStart + label.length; i++) styles[i] |= Style.LINK;
  }

  for (const { pattern, style } of EMPHASIS) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const whole = match[0];
      const inner = match[1];
      const open = whole.indexOf(inner);
      const innerStart = start + open;
      const innerEnd = innerStart + inner.length;
      const end = start + whole.length;
      // The delimiters must be untouched; the content may hold links, code or other emphasis.
      if (!open || !free(start, innerStart) || !free(innerEnd, end)) continue;
      hide(start, innerStart);
      hide(innerEnd, end);
      for (let i = innerStart; i < innerEnd; i++) if (!(styles[i] & Style.SYNTAX)) styles[i] |= style;
    }
  }
  styleCutEdges(text, styles, locked);
  return styles;
}

/** Obsidian marks an excerpt cut short with "..." at either end. */
const CUT = "...";

/** Paired markers whose other half an excerpt's cut can remove. */
const CUT_PAIRS: readonly { marker: string; style: number }[] = [
  { marker: "==", style: Style.HIGHLIGHT },
  { marker: "**", style: Style.BOLD },
  { marker: "~~", style: Style.STRIKE },
];

/**
 * An excerpt that starts or ends mid-sentence can hold half of a link or a highlight:
 * "...development advisory]]" or "==(Not yet published ...". Where the excerpt's own
 * "..." shows the cut, the unmatched half is read as if its partner lay beyond the
 * cut: the marker hides and the words between it and the cut take the style.
 */
function styleCutEdges(text: string, styles: Uint8Array, locked: Uint8Array): void {
  const head = text.startsWith(CUT) ? CUT.length : -1;
  const tailCut = text.trimEnd().endsWith(CUT) ? text.trimEnd().length - CUT.length : -1;
  const unclaimed = (index: number, length: number) => !locked.subarray(index, index + length).some(Boolean);
  const claim = (start: number, end: number, style: number) => {
    for (let i = start; i < end; i++) if (!locked[i]) styles[i] |= style;
  };
  const hide = (start: number, end: number) => {
    styles.fill(Style.SYNTAX, start, end);
    locked.fill(1, start, end);
  };
  /** Shows a link's tail as link words; an alias hides the target before its "|". */
  const linkWords = (start: number, end: number) => {
    const pipe = text.lastIndexOf("|", end - 1);
    if (pipe >= start) hide(start, pipe + 1);
    claim(pipe >= start ? pipe + 1 : start, end, Style.LINK);
  };

  if (head >= 0) {
    const close = text.indexOf("]]", head);
    const open = text.indexOf("[[", head);
    if (close > head && (open < 0 || close < open) && unclaimed(head, close + 2 - head)) {
      hide(close, close + 2);
      linkWords(head, close);
    }
  }
  if (tailCut >= 0) {
    const open = text.lastIndexOf("[[", tailCut);
    if (open >= 0 && text.indexOf("]]", open) < 0 && unclaimed(open, tailCut - open)) {
      const start = open > 0 && text[open - 1] === "!" ? open - 1 : open;
      hide(start, open + 2);
      linkWords(open + 2, text.slice(0, tailCut).trimEnd().length);
    }
  }

  for (const { marker, style } of CUT_PAIRS) {
    const positions: number[] = [];
    for (let i = text.indexOf(marker); i >= 0; i = text.indexOf(marker, i + marker.length)) {
      if (unclaimed(i, marker.length)) positions.push(i);
    }
    if (positions.length % 2 === 0) continue;
    if (head >= 0 && positions[0] > head) {
      const at = positions.shift()!;
      hide(at, at + marker.length);
      claim(head, at, style);
    } else if (tailCut >= 0 && positions[positions.length - 1] < tailCut) {
      const at = positions.pop()!;
      hide(at, at + marker.length);
      claim(at + marker.length, text.slice(0, tailCut).trimEnd().length, style);
    }
  }
}
