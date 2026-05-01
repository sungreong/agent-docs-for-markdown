---
title: Design Showcase — PPTX-Grade Templates
theme: midnight
intent: pitch
pageWidth: 1120px
pageHeight: 720px
---

# Design Showcase {#cover .cover .dark eyebrow="Markdown Pattern Studio"}

Demonstrating PPTX-skill-grade design: named palettes, typography scale, sandwich structure, and new layout templates.

---
{: .page-break}

## What We Ship {: .icon-list}

- 🎨 | 16 Named Palettes | From `midnight` to `sage` — each a complete color + font package
- 📐 | Typography Scale | Title at 2.6rem, section at 1.45rem, body at 1rem — matches PPTX pt sizing
- 🃏 | 3 New Templates | `.dark`, `.half-bleed`, `.icon-list` — visual variety without leaving Markdown
- ✅ | Anti-pattern Fixes | No heading borders, left-aligned body, consistent slide padding
- 🎯 | Intent System | `intent: pitch / report / reference / narrative` in frontmatter

---
{: .page-break}

## Performance at a Glance {#kpi .stats}

- Templates | 14 | +3 new
- Palettes | 16 | +8 new
- Font Pairings | 8 | +8 new
- QA Checklist Items | 20 | New

---
{: .page-break}

## How Half-Bleed Works {: .half-bleed side="right"}

![design diagram](https://dummyimage.com/560x720/1e2761/cadcfc.png&text=Image+fills+this+half)

**One class. Full visual impact.**

Add `.half-bleed` to any section heading. The first image found fills one half of the slide completely — `object-fit: cover` ensures no distortion.

Use `side="right"` to swap image to the right.

---
{: .page-break}

## The Sandwich Pattern {: .two-column}

### Dark Open
```markdown
# Title {#cover .cover .dark eyebrow="Label"}
```
Dark cover slide sets a premium tone. Navy, berry, cherry, or slate themes work best.

### Dark Close
```markdown
## Conclusion {: .dark}

Call to action here.
```
Dark conclusion slide closes the loop. The same accent color from your theme fills the background.

---
{: .page-break}

## Template Variety — Use All of Them {: .compare}

### Too Repetitive
Every slide uses the same `default` layout. Walls of bullet points. No visual anchors. Reader loses attention by slide 3.

### Well Varied
Cover → Stats → Icon List → Half-Bleed → Compare → Dark Close.

Six slide types. One clear message per slide. Visual element on every page.

---
{: .page-break}

## Pick Your Palette {: .agenda}

- **midnight** `#1e2761` — Executive, finance, enterprise (Georgia + Calibri)
- **coral** `#f96167` — Startup, launch, energy (Arial Black + Arial)
- **terracotta** `#b85042` — Design, culture, food (Cambria + Calibri)
- **charcoal** `#36454f` — Technical, B2B, minimal (Trebuchet MS + Calibri)
- **teal-trust** `#028090` — Healthcare, NGO, trust (Trebuchet MS)
- **berry** `#6d2e46` — Luxury, fashion (Palatino + Garamond)
- **cherry** `#990011` — Sport, urgency, bold (Impact + Arial)
- **sage** `#84b59f` — Wellness, education, calm (Calibri)

---
{: .page-break}

## Key Design Rules {: .card}

These are built into the engine and enforced by the QA checklist:

1. **No accent lines under headings** — whitespace does the work instead
2. **Left-align body text always** — center only slide titles
3. **Sandwich structure** — dark open, light content, dark close
4. **One message per slide** — if it doesn't fit, split the page
5. **Visual element on every slide** — image, stat card, icon circle, or shape

> [!INFO] From the PPTX Skill
> "Don't create boring slides. Plain bullets on a white background won't impress anyone."

---
{: .page-break}

## Start Here {: .dark}

```yaml
---
theme: midnight
intent: pitch
---
```

Pick your palette. Set your intent. Then write content.

**That is the entire design workflow.**
