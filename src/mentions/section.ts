/**
 * Adds one section of the mention footer: a header with the section's title and,
 * when given, how many notes it lists. Both sections ("Linked mentions" and "Linked
 * from properties") share it, so they look and space alike.
 */
export function addSection(parent: HTMLElement, title: string, count?: number): HTMLElement {
  const section = parent.createDiv({ cls: "pagewise-mentions-section" });
  const header = section.createDiv({ cls: "pagewise-mentions-header" });
  header.createSpan({ cls: "pagewise-mentions-title", text: title, attr: { role: "heading", "aria-level": "2" } });
  if (count !== undefined) header.createSpan({ cls: "pagewise-mentions-count", text: String(count) });
  return section;
}
