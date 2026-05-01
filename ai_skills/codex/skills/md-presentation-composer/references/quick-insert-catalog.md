# Quick Insert Catalog

Reference catalog for `md-presentation-composer`. Used during proposal and transformation phases.

---

## Design-First Rule

**Always commit to palette + intent BEFORE writing slide content.**

```yaml
---
theme: midnight       # Pick from palette table below
intent: pitch         # report | pitch | reference | narrative
---
```

Choosing the palette after filling content leads to mismatch. Pick for the topic first.

---

## Frontmatter Snippets

| Use | Frontmatter |
|-----|-------------|
| Executive pitch deck | `theme: midnight` + `intent: pitch` |
| Business report | `theme: report` + `intent: report` |
| Technical guide | `theme: charcoal` + `intent: reference` |
| Tutorial / onboarding | `theme: ocean` + `intent: narrative` |
| Wellness / education | `theme: sage` + `intent: narrative` |
| Startup launch | `theme: coral` + `intent: pitch` |

---

## Palette Reference (16 Themes)

| Theme | Character | Primary Color | Font Pairing |
|-------|-----------|--------------|--------------|
| `default` | Blue standard | `#5e6ad2` | System UI |
| `report` | Professional blue | `#3a63d6` | System UI |
| `slate` | Dark premium | `#8cb4ff` | System UI |
| `paper` | Warm document | `#b26a2f` | System UI |
| `forest` | Nature green | `#2d8a57` | System UI |
| `sunset` | Pink/warm | `#c04878` | System UI |
| `ocean` | Ocean blue | `#2f74c8` | System UI |
| `mono` | Neutral minimal | `#424242` | System UI |
| `midnight` | Navy executive | `#1e2761` | Georgia / Calibri |
| `coral` | Bold coral | `#f96167` | Arial Black / Arial |
| `terracotta` | Warm earth | `#b85042` | Cambria / Calibri |
| `charcoal` | Dark minimal | `#36454f` | Trebuchet MS / Calibri |
| `teal-trust` | Calm teal | `#028090` | Trebuchet MS / Calibri |
| `berry` | Rich berry | `#6d2e46` | Palatino / Garamond |
| `cherry` | Bold cherry | `#990011` | Impact / Arial |
| `sage` | Calm sage | `#84b59f` | Calibri / Calibri |

---

## Slide Templates — Quick Insert

### Template Selection by Item Count

Before picking a layout, count the child items first. The canvas is **1120×720px** — content is vertically centered, so sparse slides look intentionally spacious only if content density is high enough.

| Items | Best template | Density check | Avoid |
|-------|--------------|--------------|-------|
| 1 | `.message` or `.spotlight` | Add 2–3 body sentences; heading alone = sparse | — |
| 2 | `.compare` or `.two-column` | OK if each block has 3–5 lines | — |
| **3** | **`.three-column`** (symmetric) or `.timeline` (sequential) or `.icon-list` (visual) | 3 icon-list items fills ~half the slide; consider adding a 4th or an intro paragraph | **`.compare`** — leaves one card orphaned |
| 4–5 | `.icon-list`, `.stats`, `.agenda` | Optimal density range for most templates | `.compare`, `.three-column` |
| 6+ | `.agenda`, `.stats`, `.icon-list` | May need a page-break if content overflows | `.timeline` (overflows at 6+) |
| Sequential (Level 1→2→3, Step A→B) | `.timeline` regardless of count | 3–5 stages is optimal; 2 stages is thin | `.compare` |
| With icons/emoji | `.icon-list` | 4–5 items for full-slide feel | — |
| Thin content (1 insight, 1 image) | `.half-bleed` or `.dark` | Both fill the full canvas regardless of text density | — |

### Existing Templates

| pattern_id | Trigger | Class | When to Use | Snippet |
|-----------|---------|-------|-------------|---------|
| `cover` | Cover slide | `.cover` | First slide, title page | `# Title {#cover .cover eyebrow="Label"}` |
| `dark-cover` | Dark cover | `.cover .dark` | Sandwich: dark opening | `# Title {#cover .cover .dark eyebrow="Label"}` |
| `two-column` | 2-column | `.two-column` | Exactly 2 items side-by-side | `## Section {#id .two-column}` |
| `three-column` | 3-column | `.three-column` | **Exactly 3 items** — use this instead of `.compare` when items = 3 | `## Section {#id .three-column}` |
| `stats` | KPI cards | `.stats` | Metrics with label/value/delta | `## KPIs {#id .stats}` |
| `card` | Card box | `.card` | Highlighted section | `## Note {#id .card}` |
| `spotlight` | Spotlight | `.spotlight` | Lead visual + body | `## Feature {#id .spotlight}` |
| `agenda` | Agenda | `.agenda` | Ordered agenda | `## Agenda {#id .agenda}` |
| `timeline` | Timeline | `.timeline` | **Ordered stages/levels/progression** — use when items have a natural sequence (Level 1→2→3, Step A→B→C) | `## Timeline {#id .timeline}` |
| `compare` | Compare | `.compare` | **Strictly 2 items only.** ⚠️ Fixed 2-column grid — 3+ items will create an orphaned card. Never use for 3-level or multi-step content. | `## Comparison {#id .compare}` |
| `quote-slide` | Quote | `.quote-slide` | Large pull-quote | `## Quote {#id .quote-slide}` |
| `message` | Key message | `.message` | Single bold statement | `## Message {#id .message}` |

### New Templates

| pattern_id | Trigger | Class | When to Use | Snippet |
|-----------|---------|-------|-------------|---------|
| `dark-slide` | Dark slide | `.dark` | Conclusion, section break, sandwich close | `## Conclusion {: .dark}` |
| `half-bleed` | Half-bleed image | `.half-bleed` | Image fills one half, text fills other | `## Title {: .half-bleed side="right"}` |
| `icon-list` | Icon list | `.icon-list` | Feature list with icon + header + desc | `## Features {: .icon-list}` |

---

## New Template Snippets (Full)

### Dark Slide — Sandwich Close

```markdown
## Thank You {: .dark}

Contact us at hello@company.com

We look forward to hearing from you.
```

### Dark Cover — Sandwich Open

```markdown
# Product Launch 2026 {#cover .cover .dark eyebrow="Q2 Announcement"}

Transforming how teams work together.
```

### Half-Bleed (Image Left)

```markdown
## How It Works {: .half-bleed}

![architecture diagram](./diagram.png)

Our platform processes 10M events per second using a distributed pipeline that scales automatically with demand.
```

### Half-Bleed (Image Right)

```markdown
## The Result {: .half-bleed side="right"}

![result screenshot](./result.png)

Teams report 40% faster onboarding and 3× more feature velocity after switching to our platform.
```

### Icon List

```markdown
## Why Choose Us {: .icon-list}

- 🚀 | Fast Delivery | Ship features in days, not weeks
- 🔒 | Secure by Default | Zero-trust architecture built in
- 📊 | Data-Driven | Real-time analytics on every decision
- 🌍 | Global Scale | 99.99% uptime across 30 regions
```

### Sandwich Deck Structure

```markdown
---
title: Product Overview
theme: midnight
intent: pitch
---

# Product Name {#cover .cover .dark eyebrow="Company · 2026"}

One-line value proposition.

---
{: .page-break}

## The Problem {: .message}

Current tools cost teams 6 hours per week in manual work.

---
{: .page-break}

## Key Features {: .icon-list}

- ⚡ | Instant Setup | Live in 5 minutes, no engineering needed
- 🔗 | Deep Integrations | Connects to 100+ tools out of the box
- 📈 | Measurable ROI | Average 3× productivity in 30 days

---
{: .page-break}

## Performance at a Glance {#kpi .stats}

- Response Time | 12ms | -40%
- Uptime | 99.99% | +0.02%
- Daily Active Users | 84K | +28%

---
{: .page-break}

## How It Works {: .half-bleed side="right"}

![diagram](./diagram.png)

Three-step process: connect your data sources, define your workflow, and let the engine handle the rest.

---
{: .page-break}

## Get Started Today {: .dark}

Sign up free at product.com

No credit card required.
```

---

## General Document Tools (Approval-type Auto-insert)

| tool_id | Trigger | When to Use | Snippet |
|---------|---------|-------------|---------|
| `toc-basic` | Table of contents | Long documents | `## Contents\n- 1. ...\n- 2. ...` |
| `checklist` | Checklist | Action items | `- [ ] Item A\n- [ ] Item B` |
| `action-items` | Action table | Owner/deadline tracking | `\| Item \| Owner \| Due \| Status \|` |
| `decision-log` | Decision log | Record decisions and rationale | `## Decision Log\n- Decision:\n- Rationale:\n- Impact:` |
| `reference-links` | References | Sources, links | `## References\n- [Doc](URL) — description` |
| `page-break` | Page break | Split pages | `---\n{: .page-break}` |

---

## Auto-Insert Proposal Rules

- Analyze the document first, then propose candidates.
- Never modify the original before user approval.
- Present proposals as a list: pattern, reason, location.
- Apply only after full approval → emit `[FINAL OUTPUT]`.

---

## Guaranteed Markdown Render Items

These render without any snippet or class:

- Task lists (`- [ ]`, `- [x]`)
- Nested lists with indentation
- Reference links/images (`[text][id]`, `![alt][id]` + `[id]: ...`)
- Code fences (` ``` `, `~~~`) with language tags
- Inline emphasis (`**bold**`, `*italic*`, `~~strike~~`)
- Auto-links (`https://...`)
- Callouts (`> [!INFO] Title`)
