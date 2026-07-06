---
name: markdown-writer
description: Specialized Agent Docs writing and rendering skill for Markdown reports, briefs, tutorials, presentation-style documents, deck-ready Markdown, and export checks. Use when the user wants to create, rewrite, polish, design, render, or verify Markdown output rather than inspect the Source Graph.
---

# Markdown Writer

Use this as the default entry point for Agent Docs writing work. It is intentionally separate from `markdown-manager`: manager handles workspace search, graph cleanup, link impact, canonical sources, and context packaging; writer handles the reader-facing artifact.

Start by stating the writing mode you chose in one short sentence, for example: "I'll handle this as a technical report with export QA." Then build the output with a clear request contract and verification path.

## Routing

| User intent | Internal writing mode |
| --- | --- |
| Turn notes or research into a polished report, memo, proposal, tutorial, blog post, or presentation-style Markdown | `presentation-composition` |
| Convert Markdown into deck-ready pages or a PPTX/Google Slides plan while preserving page intent | `deck-design` |
| Check whether Markdown will render cleanly as standalone HTML, blog embed HTML, content fragment, DOCX handoff, or slide-like pages | `production-qa` |
| Improve visual structure, section roles, frontmatter, themes, component classes, tables, figures, and export readiness | `document-polish` |

If the low-level skills `md-presentation-composer`, `md-to-deck-designer`, or `document-production-advisor` are installed, use their detailed references after selecting the writing mode. If they are not installed, use this skill's rules and bundled renderer.

## Decision Rules

- Do not use `markdown-writer` for pure search, graph triage, `.mpsignore`, canonical-source choice, or link repair. Route those to `markdown-manager`.
- Read the source Markdown fully before rewriting. Do not design section-by-section while still discovering content.
- Compile the user's request into a visible contract: audience, output format, language, tone, must-include facts, constraints, destination path, and acceptance criteria.
- Preserve exact facts, links, quotes, numbers, code identifiers, table values, and source references unless the user explicitly asks for synthesis.
- Prefer clear structure over decoration. Every section should inform, compare, prove, teach, or drive action.
- Use Agent Docs Markdown classes only when they improve scanning or export quality.
- Before finalizing, render when possible and check for overflow, clipped headings, unreadable contrast, broken images, excessive cards, and mobile/narrow layout issues.

## Bundled Renderer

This skill includes a portable renderer so it can work even when the user's workspace does not contain `scripts/md-to-html.mjs`.

Use the installed `markdown-writer` script path for your current agent folder. Examples below use `.codex`; replace it with `.claude`, `.agents`, `.gemini`, or `.cursor` when that is where the skill is installed.

Render standalone HTML:

```bash
node .codex/skills/markdown-writer/scripts/md-to-html.mjs input.md --out .mps/writer-preview.html --standalone
```

Render blog-safe HTML:

```bash
node .codex/skills/markdown-writer/scripts/md-to-html.mjs input.md --export-target blog-embed --out .mps/writer-blog.html
```

Render with a theme/design direction:

```bash
node .codex/skills/markdown-writer/scripts/md-to-html.mjs input.md --theme midnight --intent pitch --out .mps/writer-preview.html
```

The renderer is Node-based and uses files inside this skill folder:

- `scripts/md-to-html.mjs`
- `public/document.css`
- `public/core/*.js`

If none of the agent skill paths exists, ask the user to reinstall bundled Agent Docs skills. Do not assume the workspace has a renderer script.

## Writing Workflow

1. **Contract**: Restate the user's output target, audience, language, tone, must-include content, and verification method.
2. **Source map**: Identify source files, exact facts to preserve, headings, links, tables, images, and evidence blocks.
3. **Document map**: Plan the narrative spine, section roles, density, and component system before writing.
4. **Design choice**: Pick frontmatter values such as `theme`, `intent`, optional `design`, `pageWidth`, and `pageHeight`.
5. **Draft**: Produce Markdown with clean headings, tables, captions, page breaks, and supported expression classes.
6. **Render check**: Use the bundled renderer when a file output exists or can be created safely.
7. **Revision**: Fix density, contrast, overflow, broken images, weak hierarchy, or unsupported visual ideas.
8. **Report**: Return changed files, render checks performed, and any remaining manual checks.

## Frontmatter Reference

```yaml
---
title: Document Title
theme: report
intent: reference
pageWidth: 1120px
pageHeight: 720px
toc: false
---
```

Use `intent: report` for business summaries, `intent: pitch` for presentation-like documents, `intent: reference` for dense technical docs, and `intent: narrative` for tutorials or essays.

## Supported Structure Patterns

| Pattern | Use for |
| --- | --- |
| `.cover` | title or opening page |
| `.dark` | section divider, close, or high-contrast summary |
| `.two-column` | side-by-side explanations |
| `.compare` | explicit before/after or option comparison |
| `.feature-grid` | 3-6 peer capabilities with short labels |
| `.stats` | true KPI cards, not arbitrary tables |
| `.problem-statement` | pain point framing |
| `.big-number-hero` | one important metric or claim |
| `.timeline` | 3-5 stages or events |
| `.evidence-ledger` | compact source/evidence table |
| `.priority-strip` | top-priority brief points |

Avoid turning every section into cards. If labels wrap badly or cards become mostly decoration, switch to a normal list, table, or two-column layout.

## Deck-Ready Markdown Rules

- Treat Markdown as the source contract: page boundaries, headings, evidence, and visual intent matter.
- Preserve page count when the user says "each page as a slide" or "keep the same slide count".
- Use explicit page breaks between slide-like pages.
- Keep one main message per page.
- For deck handoff, return a deck map with source page, title, role, density, layout, and verification risk.
- Do not expose temporary scripts or internal layout JSON unless the user asks.

## Production QA Checklist

- The final document satisfies every explicit user requirement.
- No fact, link, number, quote, or code identifier was silently changed.
- Headings form a clean outline.
- Tables have meaningful headers and are not too wide.
- Images have useful alt text or captions.
- Page breaks do not split paragraphs, lists, tables, or code blocks.
- Frontmatter matches the document purpose.
- Rendered HTML has no obvious overlap, clipping, invisible text, broken images, or horizontal overflow.
- Blog embed output uses `--export-target blog-embed` when the target is an existing CMS.

## Response Pattern

For planning, return:

| Section | Role | Source evidence | Layout / class | Risk |
| --- | --- | --- | --- | --- |

For final delivery, return changed file paths, render output paths, checks performed, and remaining manual checks. Keep the final response concise and grounded in the actual artifact.
