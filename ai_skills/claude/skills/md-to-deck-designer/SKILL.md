---
name: md-to-deck-designer
description: Convert existing Markdown into presentation decks while preserving page intent, slide count, source structure, and user-requested visual style. Use when the user asks to turn a Markdown file into PPTX/Google Slides, keep each Markdown page as a slide, evaluate whether the Markdown intermediate helps deck generation, or create a consistent deck using bundled presentation references.
---

# MD to Deck Designer

Use this skill to turn Markdown into a polished deck without treating the generated build script as the user's real artifact. The Markdown is the source contract. Temporary planning, rendering code, previews, and QA files are implementation details that exist only to make the final deck reliable.

## Core Position

Do not require the user to care about a build script. The agent may still need one because native PowerPoint output requires layout coordinates, theme tokens, image handling, export calls, and visual QA. Keep that layer hidden, deterministic, and disposable.

When the user asks whether Markdown can be processed "purely," answer this way:

- Pure Markdown is enough for reading intent, page boundaries, hierarchy, claims, evidence, and design hints.
- Pure Markdown is not enough to guarantee a beautiful PPTX, because PPTX needs explicit layout, typography, theme, rendering, and overflow verification.
- A good workflow reads Markdown first, derives a deck contract from it, then creates a temporary rendering layer only for execution and QA.

## Mandatory Reference Chain

Before building a deck:

1. Read the whole source Markdown before choosing slide layouts.
2. If available, use the bundled or plugin `Presentations` skill as the PPTX implementation authority. Follow its content rules, artifact-tool workflow, workspace policy, and visual QA requirements.
3. If available, use `md-presentation-composer` as the Markdown-structure authority for document map, page roles, density, component selection, and design vocabulary.
4. Read `references/source-contract.md` for the Markdown audit and page-preservation contract.
5. Read `references/deck-execution.md` for the implementation and QA checklist.

If a referenced skill or plugin is unavailable, continue with the same principles using the best available local presentation exporter, and state the limitation.

## Workflow

1. Establish the request contract: output format, audience, language, slide count rule, visual style, source file, destination path, and verification method.
2. Audit the Markdown as a complete document: page breaks, headings, tables, code, links, citations, images, density, repeated structures, and weak pages.
3. Decide the slide-count policy:
   - Preserve count when the user says "keep page count," "each page as a slide," or "do not compress."
   - Compress only when the user explicitly asks for a shorter deck or executive version.
4. Create a deck map: one row per output slide with source page, title, role, content family, density, layout archetype, and visual treatment.
5. Define a compact design system before generating slides: palette, type scale, background treatment, accent rules, title chrome, page markers, card/table/code treatments, and section rhythm.
6. Build the deck in a scratch workspace, not inside the source folder unless requested. Preserve the original Markdown.
7. Render every slide preview or contact sheet. Fix unintended overlap, clipping, unreadable contrast, inconsistent margins, bad wrapping, and broken page numbers before delivery.
8. Report the final deck path and a short evaluation of whether the Markdown intermediate helped or hurt the result.

## Evaluation Lens

When judging whether the intermediate Markdown is useful for presentation generation, score these dimensions:

- Structure: clear page breaks, stable heading hierarchy, one main idea per page.
- Design signal: classes, section roles, explicit comparison/timeline/table/code intent.
- Content density: enough material to fill slides without creating walls of text.
- Evidence preservation: source links, citations, exact identifiers, code, tables, and numbers are easy to trace.
- Consistency leverage: repeated patterns can become reusable slide components.
- Visual risk: pages that are too long, too sparse, or semantically ambiguous require more design intervention.

A Markdown file helps the deck most when it is not just prose, but a structured intermediate: page boundaries, slide-level titles, evidence blocks, and reusable roles are already present.

## Output Contract

For each completed deck task, include:

- Final deck path.
- Confirmed slide count and whether it matches the Markdown page count.
- Visual style actually applied.
- Verification performed: rendered previews, contact sheet, layout inspection, or tool-specific tests.
- Short assessment of how much the Markdown intermediate contributed to consistency and where it was insufficient.

Do not expose temporary scripts, raw layout JSON, internal slide plans, or QA logs unless the user asks for them.
