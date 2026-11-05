import { Component, getLinkpath, Keymap, MarkdownRenderer, type App, type HoverParent, type HoverPopover } from "obsidian";
import { renderAlsoLinked } from "./alsoLinked";
import { cardWeight, ColumnBalance } from "./columns";
import { addFoldToggle, onKeys, shownWhenFolded } from "./fold";
import { addSection } from "./section";
import { collectMentions, passageMarkdown, type Citation, type LinkIndex, type PropertyLink } from "./mentionIndex";

/** The id Pagewise registers with Page preview for links in its footer. */
export const HOVER_SOURCE = "pagewise";
/** How many cards the footer shows before it folds the rest behind "N more notes". */
const SHOWN_CITATIONS = 20;

/** A citing note with the Markdown of each passage, ready to draw. */
interface Card {
  citation: Citation;
  markdown: string[];
}

/**
 * The linked mentions under one paginated note, drawn by Pagewise from Obsidian's
 * public metadata in place of Obsidian's own panel. Each note that links here from
 * its text is a card whose passages Obsidian's Markdown renderer draws, so callouts,
 * highlights and links look as they do in the note. Notes that link here only from
 * their properties are a row of pills under the cards.
 *
 * The footer redraws only when what it shows changes, and an older read that
 * finishes after a newer one is dropped.
 */
export class MentionFooter extends Component implements HoverParent {
  /** Page preview's popover for a link in the footer, while one shows. */
  hoverPopover: HoverPopover | null = null;
  readonly el: HTMLElement;
  /** Everything the last draw rendered, unloaded before the next draw. */
  private drawn: Component | null = null;
  private shown = "";
  private generation = 0;
  private disposed = false;
  private cardsUnfolded = false;
  private pillsUnfolded = false;

  constructor(
    private readonly app: App,
    private readonly index: LinkIndex,
    host: HTMLElement,
    readonly notePath: string
  ) {
    super();
    this.el = host.createDiv({ cls: "pagewise-mentions", attr: { role: "region", "aria-label": "Linked mentions" } });
  }

  onload(): void {
    void this.refresh();
  }

  onunload(): void {
    this.disposed = true;
    this.generation++;
    this.el.remove();
  }

  /** Reads the mentions again and redraws if anything the footer shows changed. */
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const { citations, propertyLinks } = collectMentions(this.index, this.notePath);
    const cards = await Promise.all(citations.map((citation) => this.card(citation)));
    if (this.disposed || generation !== this.generation) return;
    const present = cards.filter((card): card is Card => card !== null);
    const shown = JSON.stringify([present.map((card) => [card.citation.path, card.citation.name, card.markdown]), propertyLinks]);
    if (shown === this.shown) return;
    this.shown = shown;
    this.draw(present, propertyLinks);
  }

  /** A citation with its passages' Markdown, or null when its note can no longer be read. */
  private async card(citation: Citation): Promise<Card | null> {
    const file = this.app.vault.getFileByPath(citation.path);
    if (!file) return null;
    try {
      const text = await this.app.vault.cachedRead(file);
      return { citation, markdown: citation.passages.map((passage) => passageMarkdown(text, passage)) };
    } catch {
      return null;
    }
  }

  private draw(cards: readonly Card[], propertyLinks: readonly PropertyLink[]): void {
    if (this.drawn) this.removeChild(this.drawn);
    const drawn = this.addChild(new Component());
    this.drawn = drawn;
    this.el.empty();

    if (cards.length === 0 && propertyLinks.length === 0) {
      addSection(this.el, "Linked mentions").createDiv({ cls: "pagewise-mentions-empty", text: "No notes link here." });
      return;
    }

    if (cards.length > 0) {
      const section = addSection(this.el, "Linked mentions", cards.length);
      const grid = section.createDiv({ cls: "pagewise-mentions-cards" });
      const columns = [grid.createDiv({ cls: "pagewise-mentions-column" }), grid.createDiv({ cls: "pagewise-mentions-column" })];
      const balance = new ColumnBalance(columns.length);
      const place = (card: Card, folded: boolean) => this.drawCard(columns[balance.place(cardWeight(card.markdown))], card, drawn, folded);
      const shown = shownWhenFolded(cards.length, SHOWN_CITATIONS);
      cards.slice(0, shown).forEach((card) => place(card, false));
      if (shown < cards.length) {
        // The folded cards are drawn the first time the reader unfolds them.
        let restDrawn = false;
        const drawRest = () => {
          restDrawn = true;
          cards.slice(shown).forEach((card) => place(card, true));
        };
        if (this.cardsUnfolded) drawRest();
        grid.toggleClass("is-unfolded", this.cardsUnfolded);
        addFoldToggle(section.createDiv({ cls: "pagewise-mentions-more" }), {
          foldedText: `${cards.length - shown} more notes`,
          unfolded: this.cardsUnfolded,
          onChange: (unfolded) => {
            if (unfolded && !restDrawn) drawRest();
            this.cardsUnfolded = unfolded;
            grid.toggleClass("is-unfolded", unfolded);
          },
        });
      }
    }

    renderAlsoLinked(
      this.el,
      propertyLinks.map(({ path, name }) => ({ name, open: (event) => this.openNote(path, event) })),
      { unfolded: this.pillsUnfolded, onChange: (unfolded) => (this.pillsUnfolded = unfolded) }
    );
  }

  private drawCard(column: HTMLElement, { citation, markdown }: Card, drawn: Component, folded: boolean): void {
    const card = column.createDiv({ cls: "pagewise-mention" });
    card.toggleClass("is-folded", folded);
    const title = card.createDiv({ cls: "pagewise-mention-title", text: citation.name, attr: { role: "link", tabindex: "0" } });
    title.addEventListener("click", (event) => this.openNote(citation.path, event));
    onKeys(title, ["Enter"], (event) => this.openNote(citation.path, event));
    citation.passages.forEach((passage, index) => {
      const el = card.createDiv({ cls: "pagewise-mention-passage markdown-rendered" });
      el.addEventListener("click", (event) => this.onPassageClick(event, citation.path, passage.line));
      el.addEventListener("mouseover", (event) => this.onPassageHover(event, el, citation.path));
      // A passage Obsidian cannot render shows as its plain text.
      MarkdownRenderer.render(this.app, markdown[index], el, citation.path, drawn).then(
        () => this.markSelfLinks(el, citation.path),
        () => el.setText(markdown[index])
      );
    });
  }

  /** Gives the links to this note a class, so the stylesheet can set them apart. */
  private markSelfLinks(el: HTMLElement, sourcePath: string): void {
    el.querySelectorAll<HTMLElement>("a.internal-link").forEach((link) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(link.dataset.href ?? ""), sourcePath);
      link.toggleClass("pagewise-mention-self", target?.path === this.notePath);
    });
  }

  /** A link opens its target; anywhere else in a passage opens the citing note at the passage's link. */
  private onPassageClick(event: MouseEvent, sourcePath: string, line: number): void {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest<HTMLElement>("a");
    if (link?.hasClass("internal-link")) {
      event.preventDefault();
      void this.app.workspace.openLinkText(link.dataset.href ?? link.getText(), sourcePath, Keymap.isModEvent(event));
      return;
    }
    if (link) return;
    const file = this.app.vault.getFileByPath(sourcePath);
    if (file) void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file, { eState: { line } });
  }

  /** Hands a hovered link to Page preview, as Obsidian's own panels do. */
  private onPassageHover(event: MouseEvent, el: HTMLElement, sourcePath: string): void {
    const link = event.target instanceof Element ? event.target.closest<HTMLElement>("a.internal-link") : null;
    if (!link || !el.contains(link)) return;
    this.app.workspace.trigger("hover-link", {
      event,
      source: HOVER_SOURCE,
      hoverParent: this,
      targetEl: link,
      linktext: link.dataset.href ?? link.getText(),
      sourcePath,
    });
  }

  private openNote(path: string, event: MouseEvent | KeyboardEvent): void {
    void this.app.workspace.openLinkText(path, this.notePath, Keymap.isModEvent(event));
  }
}
