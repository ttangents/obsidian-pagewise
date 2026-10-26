/**
 * Which notes link to a note only from their properties, decided from Obsidian's
 * public metadata (the resolved link index and each note's cached links), never
 * from how the backlinks panel draws its results. Pure, so it is unit-tested.
 */

/** The links one note holds, as Obsidian's metadata cache lists them. */
export interface NoteLinks {
  frontmatterLinks?: readonly { link: string }[];
  links?: readonly { link: string }[];
  embeds?: readonly { link: string }[];
}

/** What the decision reads from Obsidian's metadata cache. */
export interface LinkIndex {
  /** Paths of the notes that link to the target, by Obsidian's resolved link index. */
  sourcesOf(targetPath: string): string[];
  /** The cached links of one note, or null when the cache has none. */
  linksOf(path: string): NoteLinks | null;
  /** The path a link in a note resolves to, or null when it resolves to nothing. */
  resolve(link: string, sourcePath: string): string | null;
}

/** A note's name as the backlinks panel titles its card: the file name without its folder or ".md". */
export function noteName(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

/**
 * The names of the notes that link to the target only from their properties. A
 * name that another linking note shares, where that note also links from its
 * text, is left out: the panel titles both cards alike, so neither card is hidden.
 */
export function propertyOnlyNames(index: LinkIndex, targetPath: string): Set<string> {
  const propertyOnly = new Set<string>();
  const textLinked = new Set<string>();
  for (const source of index.sourcesOf(targetPath)) {
    const links = index.linksOf(source);
    if (!links) continue;
    const hits = (list: readonly { link: string }[] | undefined) =>
      (list ?? []).some(({ link }) => index.resolve(link, source) === targetPath);
    const name = noteName(source);
    if (hits(links.links) || hits(links.embeds)) textLinked.add(name);
    else if (hits(links.frontmatterLinks)) propertyOnly.add(name);
  }
  textLinked.forEach((name) => propertyOnly.delete(name));
  return propertyOnly;
}
