import { test } from "node:test";
import assert from "node:assert/strict";
import { noteName, propertyOnlyNames, type LinkIndex, type NoteLinks } from "../src/backlinks/propertyLinks";

function index(notes: Record<string, NoteLinks>): LinkIndex {
  const resolve = (link: string) => {
    const path = `${link.split("#")[0]}.md`;
    return Object.keys(notes).includes(path) || path === "Target.md" ? path : null;
  };
  return {
    sourcesOf: (target) => Object.keys(notes).filter((source) => {
      const all = [...(notes[source].links ?? []), ...(notes[source].embeds ?? []), ...(notes[source].frontmatterLinks ?? [])];
      return all.some(({ link }) => resolve(link) === target);
    }),
    linksOf: (path) => notes[path] ?? null,
    resolve,
  };
}

test("a note that links only from its properties is property-only", () => {
  const names = propertyOnlyNames(
    index({
      "Props.md": { frontmatterLinks: [{ link: "Target" }] },
      "Text.md": { links: [{ link: "Target#Heading" }] },
      "Both.md": { frontmatterLinks: [{ link: "Target" }], links: [{ link: "Target" }] },
      "Embed.md": { frontmatterLinks: [{ link: "Target" }], embeds: [{ link: "Target" }] },
      "Other.md": { frontmatterLinks: [{ link: "Elsewhere" }] },
    }),
    "Target.md"
  );
  assert.deepEqual([...names], ["Props"]);
});

test("a name shared with a note that links from its text stays visible", () => {
  const names = propertyOnlyNames(
    index({
      "a/Same.md": { frontmatterLinks: [{ link: "Target" }] },
      "b/Same.md": { links: [{ link: "Target" }] },
    }),
    "Target.md"
  );
  assert.equal(names.size, 0);
});

test("note names drop the folder and the .md extension", () => {
  assert.equal(noteName("folder/sub/My note.md"), "My note");
  assert.equal(noteName("Top.md"), "Top");
});
