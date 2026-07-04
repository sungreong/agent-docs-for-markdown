---
name: document-production-advisor
description: Plan, polish, and verify Markdown Pattern Studio documents for presentation, blog HTML, and Word/DOCX handoff. Use when creating reports, decks, memos, technical docs, blog posts, or export-ready documents that need request-fulfillment checks, readable layout, safe HTML embedding, DOCX/PPTX-aware structure, or rendered UX validation.
---

# Document Production Advisor

## Purpose

Turn rough Markdown into an export-ready document plan that works across Markdown Pattern Studio HTML, blog embeds, and Word/DOCX/PPTX handoff. This skill does not generate `.docx` or `.pptx` files directly; it prepares content, structure, and verification checks so the document can be rendered, copied, or converted cleanly later.

## When To Use

- The user asks for a report, memo, proposal, tutorial, technical guide, blog post, briefing, source synthesis, or presentation.
- The output will be copied into a blog/CMS or exported to standalone HTML.
- The document may later become a Word/DOCX file and needs clean headings, page breaks, tables, images, captions, and accessibility metadata.
- The document may later become a slide/PPTX-style deck and needs clear slide flow, non-overlapping layout, readable titles, and mobile stack fallback.
- The user wants stronger visual expression without sacrificing editability.

## Workflow

1. Read the full source before changing section-level structure.
2. Convert the user's request into a production contract:
   - requested audience, format, tone, language, and delivery target
   - must-include items and must-not-change facts
   - visible success criteria the final document must satisfy
   - verification steps that can actually be performed in the current environment
3. Classify purpose: `report`, `pitch`, `reference`, `narrative`, `technical`, `tutorial`, `blog`, or `briefing`.
4. Create a compact document map:
   - audience and action
   - narrative spine
   - content families
   - exact facts/code/tables/links/images to preserve
   - export target: `standalone`, `blog-embed`, `fragment`, or DOCX handoff
5. Pick one component system for the whole document:
   - evidence treatment: table, code block, diagram, comparison, or callout
   - KPI treatment: stats cards or table
   - expression treatment: safe zone, feature grid, big number, problem statement, or contrast pair
   - card title treatment: short labels only; move explanation into body text instead of using oversized headings inside cards
6. Write a section-by-section plan before final output.
7. Run the color/font contrast harness after render: check headings, body, muted text, links, and code against every light, dark, and accent surface; revise and re-render if anything is hard to read.
8. Verify with the request contract and production checklist.

## Request Fulfillment Harness

Treat document creation as a controlled workflow, not a one-shot rewrite. "Harness" means validating the final artifact against the user's actual request; it is not a content theme.

### 1. Compile The Request

Extract the user's request into explicit checks:

| Check | Question |
| --- | --- |
| Format | Did the user ask for report, slide deck, blog, README, memo, DOCX handoff, or HTML export? |
| Audience | Who must understand or act on this document? |
| Required content | Which source files, facts, topics, examples, or screenshots must be included? |
| Constraints | Language, length, style, platform, export target, mobile behavior, citations, or no-go areas |
| Acceptance criteria | What would make the user say "this is done"? |
| Verification method | Can this be checked by render, screenshot, DOM/layout audit, tests, or only manual review? |

### 2. Gate The Plan

Before final output, make sure every planned section maps back to at least one user requirement. Remove decorative sections that do not serve the request. Keep a simple trace:

| User requirement | Output section/page | Evidence it is satisfied | Verification |
| --- | --- | --- | --- |
| Example: mobile-friendly blog copy | Blog embed export | stack layout + narrow render pass | DOM/screenshot audit |
| Example: executive PPTX-like brief | 5 slide-like sections | title, problem, proof, plan, close | visual overlap check |

### 3. Verify The Rendered Artifact

When the environment allows rendering:

- Render standalone HTML for full-page review.
- Render `blog-embed` when the target is copy/paste into an existing site.
- Inspect both desktop and narrow/mobile widths.
- Check for horizontal overflow, clipped headings, overlapping fixed controls, invisible text, broken images, empty sections, and unreadable tables.
- If a visual technique does not render correctly, remove it or replace it with a simpler supported class.

For DOCX-like outputs, verify the Markdown has a real outline, meaningful headings, captions, table headers, image alt text, and no interaction-only content. For PPTX-like outputs, verify slide flow, title readability, one main message per page, sufficient font scale, no unintended overlap, and no dense wall-of-text slide.

### 4. Report Truthfully

Final response should separate:

- satisfied requirements
- changed files/artifacts
- tests/render checks performed
- known limitations or checks that could not be performed
- removed or skipped ideas because they were unsupported or unnecessary

## In-Extension Test Fixture

Use `examples/request-fulfillment-render-test.md` as a quick extension smoke test:

1. Open the file in VS Code.
2. Run `MD Studio: Preview`.
3. Export it as standalone HTML and `blog-embed`.
4. Check desktop and narrow widths for overflow, clipped titles, table readability, and slide-like flow.

The fixture intentionally mixes DOCX-like report structure, PPTX-like slide pages, images/tables/checklists, and blog-safe expression classes. If the extension cannot render that fixture cleanly, simplify the unsupported technique before using it in real user documents.

## Markdown Pattern Studio Expression Classes

Use only classes that are supported by the current renderer:

| Class | Use For |
| --- | --- |
| `.safe-zone` | Keep critical content in the central reading area for slides, banners, and blog embeds |
| `.problem-statement` | Pain-point or problem framing sections |
| `.big-number-hero` | One strong metric or claim |
| `.feature-grid` | 3-6 independent feature/capability bullets with short labels and concise body text |
| `.metrics-dashboard` | KPI-like bullets that should scan as cards |
| `.contrast-pair` | Before/after, old/new, risk/response comparisons |
| `.gradient-number` | Accent treatment for a number paragraph or list emphasis |
| `.oversized` | Large typographic statement |
| `.screenshot-shadow` | Product/result screenshot emphasis |
| `.briefing-lead` | Lead section for the highest-priority finding, update, decision, or briefing opener |
| `.priority-strip` | Short list of top points, developments, risks, or actions that should scan quickly |
| `.evidence-ledger` | Compact source/evidence list for briefings, research summaries, or decision memos |

Example:

```markdown
## Cost of Delay {: .problem-statement}

Slow handoff creates another review loop. The fix is a visible, testable workflow.

## 42% {: .big-number-hero}

Reduction in rewrite cycles after moving to structured Markdown.

## Capability Map {: .feature-grid}

- VS Code Preview
- Blog-safe HTML export
- Stack-first mobile reading
```

For richer cards, prefer bold labels inside list items:

```markdown
## Capability Map {: .feature-grid}

- **Preview**: VS Code and browser render checks stay close to the source.
- **Export**: Blog-safe HTML and standalone output use the same structure.
- **Handoff**: DOCX/PPTX-bound content keeps clean headings and captions.
```

Avoid using card grids for long conceptual labels or nested section headings. If a card title wraps into single letters or awkward fragments, shorten it or switch to `.timeline`, `.icon-list`, or a normal list.

## DOCX-Aware Production Concepts

## Briefing / Priority Writing Concepts

Use this when the reader needs the highest-priority information first: current-topic updates, research synthesis, source collection, trend review, meeting brief, decision memo, incident summary, market monitoring, or any document where "what matters now" should come before background. Do not add this structure to ordinary reference docs unless it helps the reader act faster.

Briefing-style documents should use an inverted-priority order:

1. Lead with the highest-impact finding, newest relevant update, or decision point.
2. Explain why it matters to the reader.
3. Add the concrete evidence, numbers, quotes, or source references.
4. Move background, timeline, methodology, and caveats after the priority points.
5. Close with what to watch next or what remains unverified.

Recommended Markdown Pattern Studio structure:

```markdown
## Lead Brief {: .briefing-lead}
The most important finding, update, or decision point in one or two direct sentences.

## Priority Points {: .priority-strip}
- Most important confirmed point
- High-impact consequence for the reader
- Open question to monitor

## Why It Matters
Explain the consequence before giving long background.

## Background and Context
Put older context here, not above the priority points.

## Evidence Checked {: .evidence-ledger}
- Source | What it supports | Link/date
```

For reader-facing briefings, avoid developer-facing filler such as "pipeline", "harness", "render path", or implementation notes unless the audience is explicitly technical. Prefer clear labels such as "Key point", "Why it matters", "What changed", "Evidence checked", "Open questions", and "What to watch".

## DOCX-Aware Production Concepts

When a Markdown document may later become Word/DOCX:

- Keep heading levels sequential and meaningful. They become the future outline and table of contents.
- Use real lists, not manually typed bullet symbols.
- Use page-break markers only between sections, never in the middle of a paragraph, table, or code block.
- Give tables a short caption and keep headers as actual comparison axes.
- Avoid very wide tables; split, summarize, or mark them as landscape candidates.
- Give images meaningful alt text and captions.
- Keep footnote-like source notes close to the claim they support.
- Do not rely on hover, collapsible details, or fixed-position UI for essential information.
- Use separate paragraphs for separate ideas. Do not force line breaks inside one paragraph for layout.
- Prefer tabular data for true comparisons, not layout-only tables.

## Production Checklist

- The final document can be traced back to the user's explicit request.
- Every must-include item is present or explicitly called out as unavailable.
- No unsupported or decorative technique is kept merely because it looks impressive.
- First screen communicates the core message within 3 seconds.
- Every section has one job: inform, compare, prove, teach, or drive action.
- Long paragraphs over 6 lines are split into bullets, tables, or subheadings.
- Tables have captions and do not use a fake merged-title first row.
- Images have useful alt text/captions and stay near the text that explains them.
- Blog embed output uses `--export-target blog-embed` when pasted into an existing site.
- Mobile/narrow layouts avoid slide-only assumptions; use Stack-friendly sections.
- If Word/DOCX handoff is likely, headings, lists, page breaks, images, and tables are kept structurally clean.

## References

- `references/markdown-expression-techniques.md`
- `references/docx-production-principles.md`
- `references/request-fulfillment-harness.md`
- `examples/request-fulfillment-render-test.md`
