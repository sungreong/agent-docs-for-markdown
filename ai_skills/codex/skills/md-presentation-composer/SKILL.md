---
name: md-presentation-composer
description: Reads existing Markdown and restructures it into a well-designed report, pitch, technical doc, tutorial, or presentation. Applies PPTX-skill-grade design thinking: audit → map → commit → verify. Proposes structure, palette, typography, and layout before making any changes.
---

# MD Presentation Composer

## Purpose

Transform Markdown into purpose-driven, visually structured documents that rival professionally designed presentations. Apply the same design discipline used in the Anthropic PPTX skill — named palettes, layout variety, typography scale, visual QA — without leaving Markdown.

## Design Framework (Audit → Map → Commit → Verify)

Before writing a single line of output, work through four phases:

**Phase 1 — Audit**: Classify content AND assess density.
- What is the primary content? text-heavy / data-heavy / visual-heavy / mixed
- Who is the reader? executive / technical / general / student
- What action should they take after reading?
- **For each section: count the items.** A slide is 1120×720px with ~656px usable height. Content is vertically centered. A section with only 2–3 items or 1 short paragraph will feel sparse — decide whether to merge it with adjacent content, add supporting body text, or use a visually heavier template (`.half-bleed` always fills the canvas). See `references/environment-guide.md` for per-template height footprints.

**Phase 2 — Map**: Assign content to layout archetypes, accounting for item count.
- Cover → `.cover` or `.cover .dark`
- Key stats/KPIs → `.stats` (need 4–6 for a full slide; fewer → combine with adjacent content)
- Single argument/message → `.message` (always add 2–3 supporting sentences — heading alone is too sparse)
- Side-by-side exactly 2 → `.compare` or `.two-column`
- Exactly 3 symmetric items → `.three-column` (never `.compare` for 3 items)
- Feature list with icons → `.icon-list` (4–5 items optimal; 3 items fills only half the slide)
- Sequential stages → `.timeline` (3–5 stages; more than 5 may overflow)
- Image-dominant → `.half-bleed` (always full-canvas; use when content is otherwise thin)
- Conclusion/CTA → `.dark` (always full-canvas)
- Consecutive slides should alternate visual weight — see pairing table in `references/environment-guide.md`

**Phase 3 — Commit**: Choose a cohesive visual identity BEFORE filling content.
- Pick one palette (see palette table below). If the topic is financial/executive → `midnight`. Energy/startup → `coral`. Nature/wellness → `forest` or `sage`. Technical/minimal → `charcoal`.
- **Density check against theme**: lighter themes (`default`, `report`, `sage`, `paper`) need denser content to anchor the slide. Darker themes (`midnight`, `charcoal`, `berry`) carry sparser slides better.
- Pick an `intent:` value that matches the document's purpose.
- Apply `theme:` + `intent:` in frontmatter. Never leave these blank for a designed output.

**Phase 4 — Verify**: Run the visual QA checklist before declaring done (see `references/validation-rules.md`).
- For each slide: would a reader see this and think "this slide is full"? If not, add content or switch to a denser template.
- Check template pairing: no same template used 3+ slides in a row; alternate heavy and light templates.

## Execution Rules

1. Classify document purpose first: `report`, `pitch`, `technical`, `tutorial`, `presentation`.
2. Present the full transformation plan. Do not modify the original at this stage.
3. The plan must include: change summary, auto-insert candidates, layout decisions, palette recommendation, `intent:` value, aspect ratio.
4. Get user approval, then emit `[FINAL OUTPUT]`.
5. When in doubt: fewer decorations, clearer structure.

## Input Rules

1. If `$ARGUMENTS[0]` is a file path, read and process it.
2. If `$ARGUMENTS[0]` is body text, process it directly.
3. If `$ARGUMENTS[1]` is absent, default tone is `report`.

## Frontmatter Reference

```yaml
---
title: Document Title
theme: midnight          # See palette table below
intent: pitch            # report | pitch | reference | narrative
pageWidth: 1120px
pageHeight: 720px
toc: false
---
```

### `intent:` Values

| Value | Effect | Best for |
|-------|--------|----------|
| `report` | Dense layout, full TOC, compact tables | Business reports, summaries |
| `pitch` | Large headings, bold callouts, visual templates | Investor decks, proposals |
| `reference` | Compact, navigable, info-dense | Docs, wikis, technical guides |
| `narrative` | Generous whitespace, reading flow | Tutorials, essays, onboarding |

## Palette Reference (All 16 Themes)

| Theme | Character | Primary | Best for |
|-------|-----------|---------|----------|
| `default` | Blue standard | `#5e6ad2` | General purpose |
| `report` | Professional blue | `#3a63d6` | Business reports |
| `slate` | Dark premium | `#8cb4ff` | Dark-mode decks |
| `paper` | Warm document | `#b26a2f` | Print-style docs |
| `forest` | Nature green | `#2d8a57` | Sustainability, health |
| `sunset` | Pink/warm | `#c04878` | Creative, lifestyle |
| `ocean` | Ocean blue | `#2f74c8` | Tech, data, travel |
| `mono` | Neutral minimal | `#424242` | Legal, academic |
| `midnight` | Navy executive | `#1e2761` | Finance, executive |
| `coral` | Bold coral | `#f96167` | Startup, energy, launch |
| `terracotta` | Warm earth | `#b85042` | Culture, design, food |
| `charcoal` | Dark minimal | `#36454f` | Technical, B2B |
| `teal-trust` | Calm teal | `#028090` | Healthcare, NGO |
| `berry` | Rich berry | `#6d2e46` | Luxury, fashion |
| `cherry` | Bold cherry | `#990011` | Sport, urgency |
| `sage` | Calm sage | `#84b59f` | Wellness, education |

**Palette selection rule (from PPTX skill):** Pick colors that match THIS specific topic. One color must dominate at 60–70% visual weight. Never give all colors equal weight.

## Template Reference (All Templates)

### Existing Templates

| Markdown Class | Template | Best for |
|---------------|----------|----------|
| `.cover` | Cover | First slide, title page |
| `.two-column` / `.cols-N` | Column layout | Side-by-side comparison |
| `.card` | Card | Highlighted section box |
| `.spotlight` | Spotlight | Lead image/stat with body |
| `.stats` / `.stats-list` | Stats | KPI cards: `label \| value \| delta` |
| `.agenda` | Agenda | Ordered agenda list |
| `.timeline` | Timeline | Roadmap, event sequence |
| `.compare` | Compare | Explicit 2-column compare |
| `.quote-slide` | Quote | Large pull-quote display |
| `.message` | Message | Single bold key message |

### New Templates (Added in This Session)

| Markdown Class | Template | Syntax | Best for |
|---------------|----------|--------|----------|
| `.dark` | Dark Slide | `## Title {: .dark}` | Cover, conclusion, section divider — creates the "sandwich" pattern |
| `.half-bleed` | Half-Bleed | `## Title {: .half-bleed side="right"}` + image first | Image fills one half, text fills the other |
| `.icon-list` | Icon List | `## Title {: .icon-list}` + `- 🚀 \| Header \| Description` | Feature list with icon circles |

### Sandwich Structure Pattern (PPTX skill concept)

Dark title slide → light content slides → dark conclusion slide.

```markdown
# Product Launch {#cover .cover .dark eyebrow="Q2 2026"}

---
{: .page-break}

## Key Features {#features .two-column}
...

---
{: .page-break}

## Get Started Today {: .dark}
Contact us at hello@company.com
```

### Half-Bleed Example

```markdown
## Why It Works {: .half-bleed side="right"}

![product screenshot](./screenshot.png)

The image fills the right half. This text appears on the left with generous padding and vertical centering.
```

### Icon List Example

```markdown
## Why Choose Us {: .icon-list}

- 🚀 | Fast Delivery | Ship features in days, not weeks
- 🔒 | Secure by Default | Zero-trust architecture built in
- 📊 | Data-Driven | Real-time analytics on every decision
- 🌍 | Global Scale | 99.99% uptime across 30 regions
```

## Output Sequence

1. `[DOCUMENT PLAN]` — original diagnosis, document purpose, audience, first-page role
2. `[PALETTE & INTENT]` — recommended theme + intent + font pairing rationale
3. `[SECTION BREAKDOWN]` — section reorder and page-break plan, one layout per slide
4. `[DESIGN DECISIONS]` — why each template was chosen, what visual element each slide gets
5. `[RISK CHECK]` — meaning preservation risk, aspect ratio recommendation with rationale
6. User approval
7. `[FINAL OUTPUT]` — final Markdown

## Design Anti-Patterns to Avoid

These are structurally prevented by the engine, but avoid introducing them in content:

- Never repeat the same layout more than 2 slides in a row
- Never center-align body paragraphs or list items (only titles)
- Never leave a slide with only text and no visual element (image, stat, icon, or shape)
- Never use a decorative `---` border under headings (the engine no longer renders these)
- Never choose blue just because it's safe — pick the palette that fits the topic
- Never commit to a palette after writing content — choose it first

## Page Sizing Policy

- `pageWidth` / `pageHeight` accept CSS length values.
- Unitless numbers are auto-corrected to `px`: e.g. `1900` → `1900px`.
- Web preview uses `contain` responsive scale.
- Saved HTML / print uses fixed page size.

## Quality Gates

- No consecutive `page-break` tokens; no trailing `page-break`.
- No blank pages (section with no meaningful content).
- Dense tables/images/code → prioritize page separation.
- UTF-8 encoding — detect and recover garbled characters.
- Heading hierarchy must not skip levels or have empty headings.
- Images should have `alt` / `caption`; tables should have `caption`; code blocks should have a language tag.

## Syntax Preservation Checklist

Do not damage these during transformation:

- Task lists (`- [ ]`, `- [x]`)
- Nested lists and item continuation paragraphs
- Inline emphasis (`_ / __ / * / ** / ~~`)
- Auto-links and reference-style links/images
- Code fences (```` ``` ```` / `~~~`) and hard line breaks

## Export Quality Checklist

- Relative-path images → verify Base64 embedding in standalone CLI output
- Missing local images → conversion continues, original `src` preserved + fallback region shown
- Mermaid → render attempt first, fallback to source on failure
- Outline sidebar click → scroll to section
- Code block copy button → works in standalone HTML
- Long code → prefer `maxHeight` attribute over section height restriction

## Self-Check Before Final Output

1. Does the first page communicate the core message within 3 seconds?
2. Is the chosen palette dominant (one color at 60–70% weight)?
3. Does every slide have at least one non-text visual element?
4. Does the layout vary — no same template used 3+ times in a row?
5. Are the `intent:` and `theme:` set in frontmatter?
6. Is the sandwich structure applied (dark cover + dark conclusion)?
7. Is original meaning, code, tables, links, and image syntax fully preserved?

## Reference Documents

- **Rendering environment guide** (read first): `references/environment-guide.md` — canvas dimensions, per-template height footprints, density rules, template pairing, what the renderer does NOT support
- Design decision rules: `references/document-design-rules.md`
- PPT-style Markdown deck rules: `references/ppt-like-markdown-rules.md`
- Quick insert catalog: `references/quick-insert-catalog.md`
- Layout orientation rules: `references/layout-orientation-rules.md`
- Validation and QA rules: `references/validation-rules.md`
