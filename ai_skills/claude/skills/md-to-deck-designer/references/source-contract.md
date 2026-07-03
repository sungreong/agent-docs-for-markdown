# Source Contract

Use this reference when auditing Markdown before deck generation.

## Page Boundary Rules

- Treat explicit Markdown page-break markers as authoritative when the user asks to preserve page count.
- For Markdown Pattern Studio style documents, split on page-break blocks such as `---` followed by `{: .page-break}`.
- Each source page should map to exactly one output slide when preservation is requested.
- Do not merge, drop, or create slides unless the user allows compression or expansion.

## Page Audit Fields

For every source page, derive:

- Slide number.
- Source title.
- Main message.
- Content family: cover, message, list, table, code, comparison, timeline, case study, warning, checklist, source appendix, or closing.
- Density: sparse, balanced, dense, or overflow risk.
- Must-preserve items: exact numbers, identifiers, citations, links, code, table cells, image references.
- Design role: hero, evidence, comparison, process, architecture, risk, checklist, reference, or appendix.

## Useful Markdown Signals

Strong deck-generation signals:

- One H1/H2 title per page.
- Short paragraphs that state the slide thesis.
- Lists grouped by semantic role rather than raw notes.
- Tables used for actual matrices, not layout hacks.
- Code fences with a language tag.
- Links and sources near the claims they support.
- Classes such as `.compare`, `.timeline`, `.stats`, `.message`, `.dark`, `.feature-grid`, or `.table-fit`.

Weak signals:

- Many heading levels on one page.
- Long paragraphs without hierarchy.
- Repeated bullet lists with no visual role.
- Dense appendices mixed into main narrative slides.
- Missing citations for claims that appear evidence-based.
- Page breaks that divide content mechanically rather than semantically.

## Intermediate Usefulness Score

Use a 0-5 score when the user asks whether the Markdown intermediate helped:

- 5: Page intent, hierarchy, evidence, and visual roles are clear enough to generate a consistent deck with light intervention.
- 4: Mostly usable; a few dense or sparse slides need design interpretation.
- 3: Useful as content inventory, but layout roles and slide messages need substantial reconstruction.
- 2: Helps preserve text but gives weak design signal.
- 1: Mostly raw prose or notes; deck quality depends on agent rewriting.
- 0: Not usable as a presentation intermediate without rebuilding the document.

Explain the score in terms of structure, design signal, density, and consistency leverage.
