# Request Fulfillment Harness

Use this checklist whenever a user asks you to create, rewrite, polish, or export a document.

This is a validation harness for the user's request, not a topic or writing theme. The goal is to prove that the delivered document does what the user asked for.

## Request Contract

Before editing, write down:

- user goal
- target audience
- required format
- language and tone
- source files or facts that must be preserved
- required sections or visuals
- export target
- acceptance criteria
- verification method

## Requirement Trace

Keep a compact trace while drafting:

| User requirement | Output location | Evidence | Verification |
| --- | --- | --- | --- |
| Required topic/fact/source | Section, slide, table, or figure | Exact wording, citation, screenshot, or preserved value | Manual check or source diff |
| Required format/platform | HTML, blog embed, README, DOCX handoff, or PPTX-like deck | Export target or structural pattern | Render/test command |
| Required UX behavior | Mobile stack, no overlap, readable table, editable HTML | CSS class, layout choice, editor fallback | Screenshot/DOM audit |

If a requirement has no output location, do not finalize.

## Planning Gate

Each section in the output must answer one of these:

- What did the user ask for?
- What does the reader need to know?
- What evidence proves the claim?
- What action should the reader take?

If a section answers none of these, remove it.

## Render Gate

After generating Markdown, render it when possible.

Check:

- no horizontal overflow
- no clipped titles
- no overlapping fixed controls
- no text that is too small or invisible
- no dark/accent surface where heading, body, muted, link, or code text fails readable contrast
- no broken images without fallback
- no table that requires awkward side scrolling unless unavoidable
- no empty or nearly empty slides
- no page where a heading is detached from its evidence
- mobile/narrow width stacks instead of forcing slide-only layout

DOCX-like documents also need:

- sequential headings that could become a TOC
- real lists instead of typed bullet symbols
- tables with real header rows and short captions
- images with useful alt text/captions
- page breaks only between stable sections
- no hover-only or collapsible-only essential content

PPTX-like documents also need:

- one main message per slide-like page
- title text that does not wrap unexpectedly or clip
- no unintended overlap between diagram/text elements
- enough font scale for projection-style reading
- color/font contrast checked after render, especially for `.dark`, `.message .dark`, and muted paragraphs
- clear slide-to-slide story flow
- lower density when the content is meant to be presented

Briefing, synthesis, or current-topic documents also need:

- the highest-priority or most time-sensitive point before background context
- a clear lead sentence that answers what matters and why it matters
- source/evidence notes close to the claims they support
- unverified or missing information labeled as such instead of blended into conclusions
- "what to watch next", "next decision", or "open questions" when the situation is still developing
- developer/process language removed unless the audience is technical

## Revision Gate

If the render fails:

- simplify the class/template
- split dense content
- convert decorative cards back to lists/tables
- revise color/font pairing: remove low-contrast muted text, switch dark slides to inverse/light text, or move dense prose to a light template
- remove unsupported HTML or CSS assumptions
- re-render and check again

If an idea cannot be checked inside Markdown Pattern Studio, remove it from the mandatory checklist or mark it as a later DOCX/PPTX handoff concern. Do not keep impossible checks as if they passed.

## Final Report

Tell the user:

- what was changed
- what was verified
- what could not be verified
- which ideas were skipped or removed because they were unsupported, unnecessary, or visually brittle
