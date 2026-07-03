# Deck Execution

Use this reference when turning the source contract into an actual presentation.

## Implementation Rules

- Prefer the bundled or plugin `Presentations` skill for PPTX implementation.
- Follow its required content rules and use its required export mechanism when available.
- Use a scratch workspace for scripts, previews, layout JSON, temporary assets, and QA logs.
- Keep generated scripts plain and reproducible. They are temporary build artifacts, not user-facing deliverables.
- Preserve the original Markdown unless the user explicitly asks to edit it.

## Design System Rules

Before building slides, define:

- Palette with one dominant background or surface color.
- Accent hierarchy: primary accent, secondary accent, warning/error accent, muted text.
- Typography scale for cover title, slide title, section labels, body, captions, and code.
- Repeated chrome: page number, deck label, section marker, or footer.
- Layout families: hero, two-column comparison, evidence table, process/timeline, code/eval, checklist, appendix.
- Density policy: shorten text before shrinking below readable sizes.

For explicit visual-style requests, create a custom visual direction from scratch rather than using a generic default template. The user's visual direction overrides bundled default layouts.

## QA Checklist

Before delivery:

- Confirm output slide count.
- Confirm page-to-slide mapping when preservation was requested.
- Render previews or a contact sheet.
- Inspect representative slides from beginning, middle, dense sections, and ending.
- Check for overlap, clipping, bad wrapping, inconsistent margins, unreadable contrast, and tiny text.
- Verify citations, links, code, tables, and exact identifiers were preserved where required.
- Run automated deck tests when available, but do not rely only on automated checks.

## User-Facing Evaluation

When reporting the result, be candid:

- Say whether the Markdown was a strong, medium, or weak intermediate.
- Name the main reason: page structure, content density, design classes, evidence traceability, or lack of visual roles.
- Explain whether the final visual consistency came from the Markdown itself, from the deck design system, or from manual/agent interpretation.
- If the deck became prettier mainly because of the generated design system rather than the Markdown, say that directly.
