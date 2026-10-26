/**
 * Which notes link to a note, and from where: the passages of their text that hold a
 * link (or embed) to it, and the notes that link to it only from their properties.
 * Everything comes from Obsidian's public metadata (the resolved link index and each
 * note's cached links, sections and list items). Pure, so it is unit-tested.
 */

/** A place in a note, as Obsidian's metadata cache records it. */
export interface Loc {
  line: number;
  offset: number;
}

export interface Span {
  start: Loc;
  end: Loc;
}

/** The parts of a note's cached metadata the mention footer reads. */
export interface NoteCache {
  links?: readonly { link: string; position: Span }[];
  embeds?: readonly { link: string; position: Span }[];
  frontmatterLinks?: readonly { link: string }[];
  sections?: readonly { type: string; position: Span }[];
  listItems?: readonly { position: Span }[];
}

/** What the mention footer reads from Obsidian's metadata cache. */
export interface LinkIndex {
  /** Paths of the notes that link to the target, by Obsidian's resolved link index. */
  sourcesOf(targetPath: string): string[];
  /** The cached metadata of one note, or null when the cache has none. */
  cacheOf(path: string): NoteCache | null;
  /** The path a link in a note resolves to, or null when it resolves to nothing. */
  resolve(link: string, sourcePath: string): string | null;
}

/**
 * One passage of a source note: its text runs from offset `from` to `to`, and its
 * first link to the target starts at offset `link`, on line `line` (counted from 0).
 */
export interface Passage {
  from: number;
  to: number;
  link: number;
  line: number;
}

/** A note that links here from its text, with each passage that holds such a link. */
export interface Citation {
  path: string;
  name: string;
  passages: Passage[];
}

/** A note that links here only from its properties. */
export interface PropertyLink {
  path: string;
  name: string;
}

export interface Mentions {
  citations: Citation[];
  propertyLinks: PropertyLink[];
}

/** A passage longer than this many characters shows only the lines around its link. */
export const LONG_PASSAGE = 2000;
/** Lines kept before and after the link when a passage is narrowed. */
const CONTEXT_LINES = 2;

/**
 * The notes that link to `targetPath`, sorted by name. A note that links from its
 * text (a link or an embed) is a citation with one passage per paragraph, list item or
 * other block holding such a link; a note whose only links are in its properties is a
 * property link. A note that links to itself is left out.
 */
export function collectMentions(index: LinkIndex, targetPath: string): Mentions {
  const citations: Citation[] = [];
  const propertyLinks: PropertyLink[] = [];
  const sources = index.sourcesOf(targetPath).filter((source) => source !== targetPath);
  const names = displayNames(sources);
  for (const source of sources) {
    const cache = index.cacheOf(source);
    if (!cache) continue;
    const resolvesHere = ({ link }: { link: string }) => index.resolve(link, source) === targetPath;
    const textLinks = [...(cache.links ?? []), ...(cache.embeds ?? [])].filter(resolvesHere);
    const name = names.get(source) ?? source;
    if (textLinks.length > 0) {
      citations.push({ path: source, name, passages: passagesFor(cache, textLinks.map((link) => link.position)) });
    } else if ((cache.frontmatterLinks ?? []).some(resolvesHere)) {
      propertyLinks.push({ path: source, name });
    }
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return { citations: citations.sort(byName), propertyLinks: propertyLinks.sort(byName) };
}

/**
 * The blocks that hold the given links, in order and without repeats: the innermost
 * list item holding a link, or else its section. A link outside every block stands
 * on its own line.
 */
function passagesFor(cache: NoteCache, links: readonly Span[]): Passage[] {
  const contains = (outer: Span, inner: Span) => outer.start.offset <= inner.start.offset && inner.end.offset <= outer.end.offset;
  const seen = new Map<number, Passage>();
  for (const link of links) {
    const items = (cache.listItems ?? []).filter((item) => contains(item.position, link));
    const innermost = items.sort((a, b) => b.position.start.offset - a.position.start.offset)[0];
    const block = innermost?.position ?? cache.sections?.find((section) => contains(section.position, link))?.position ?? link;
    const known = seen.get(block.start.offset);
    if (!known) {
      seen.set(block.start.offset, { from: block.start.offset, to: block.end.offset, link: link.start.offset, line: link.start.line });
    } else if (link.start.offset < known.link) {
      known.link = link.start.offset;
      known.line = link.start.line;
    }
  }
  return [...seen.values()].sort((a, b) => a.from - b.from);
}

/**
 * The Markdown a passage shows, cut from the source note's text. A passage longer
 * than LONG_PASSAGE keeps only the lines around its first link. Embeds become links,
 * so a passage never pulls a whole note or image (or this very note) into the footer.
 */
export function passageMarkdown(text: string, passage: Passage): string {
  let markdown = text.slice(passage.from, passage.to);
  if (markdown.length > LONG_PASSAGE) {
    const lines = markdown.split("\n");
    const at = text.slice(passage.from, passage.link).split("\n").length - 1;
    markdown = lines.slice(Math.max(0, at - CONTEXT_LINES), at + CONTEXT_LINES + 1).join("\n");
  }
  return withoutEmbeds(markdown);
}

/** Turns `![[note]]` and `![alt](url)` into plain links. */
export function withoutEmbeds(markdown: string): string {
  return markdown.replace(/!\[\[/g, "[[").replace(/!\[([^\]\n]*)\]\(/g, "[$1](");
}

/**
 * The name each note shows: its file name without folder or ".md", or, where two
 * notes share a file name, the path without ".md", so the two can be told apart.
 */
export function displayNames(paths: readonly string[]): Map<string, string> {
  const base = (path: string) => stripMd(path.slice(path.lastIndexOf("/") + 1));
  const counts = new Map<string, number>();
  paths.forEach((path) => counts.set(base(path), (counts.get(base(path)) ?? 0) + 1));
  return new Map(paths.map((path) => [path, (counts.get(base(path)) ?? 0) > 1 ? stripMd(path) : base(path)]));
}

function stripMd(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}
