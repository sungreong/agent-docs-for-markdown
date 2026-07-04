# Image Placement Rules

Use this reference when a Markdown Pattern Studio document contains screenshots, diagrams, photos, generated images, logos, or visual evidence. The goal is to choose a stable layout that renders cleanly in the fixed 1120x720 slide canvas and still degrades well in narrow/stacked views.

## Placement Decision Matrix

| Image role | Use | Why | Avoid |
| --- | --- | --- | --- |
| One primary screenshot, diagram, or photo plus explanation | `.half-bleed` | Most reliable image-led layout; fills the canvas and prevents sparse slides | More than one hero image on the same slide |
| Product/result screenshot that supports nearby text | `.screenshot-shadow` on the image | Adds emphasis without changing section structure | Decorative shadows on dense evidence tables |
| Lead visual plus body paragraph in a normal content slide | `.spotlight` | Keeps the image and explanation together without making the image dominate | Text-only spotlight |
| Two related visuals to compare | `.compare` or `.two-column` | Gives each visual a clear side and caption | Three images in `.compare`; use `.three-column` or split |
| Three peer visuals | `.three-column` | Symmetric 3-up layout | Long captions; split if each image needs explanation |
| Screenshot sequence or workflow | `.timeline` with short labels, or split into pages | Preserves order and avoids unreadable miniatures | A single collage of tiny screenshots |
| Evidence image needed for DOCX/report handoff | Normal image near the paragraph + caption | Keeps source context and accessibility intact | Full-bleed decorative crop that removes evidence details |
| Decorative atmosphere only | Prefer not to include, or use cover/dark slide sparingly | MPS decks should preserve meaning over decoration | Stock-like filler image on every page |

## Default Rules

1. Give every important image meaningful alt text.
2. Keep the image close to the paragraph, bullet, or table that explains it.
3. Keep captions on the same page as the image whenever possible.
4. Use one dominant visual per slide. If two visuals compete, split the slide or make the relationship explicit with `.compare`.
5. Do not use raw HTML wrappers for layout. Use Markdown image syntax plus supported MPS classes.
6. Do not depend on text embedded inside an image for essential meaning; repeat the key point in Markdown text.
7. Do not invent screenshots, logos, product images, or brand assets. Use only provided, generated-with-approval, or explicitly sourced images.

## `.half-bleed` Rules

Use `.half-bleed` when the image is the anchor of the slide and the text is explanatory.

```markdown
## What Changed {: .half-bleed side="right"}

![dashboard screenshot showing the new alert flow](./assets/alert-flow.png)

The new flow moves the highest-risk alert into the first screen.

Operators can confirm the owner, status, and next action without opening a second panel.
```

- `side="right"` places the image on the right; omit it for the default side.
- Put the image first after the heading. The renderer uses the first image as the bleed image.
- Keep text to 1-3 short paragraphs or 3-5 bullets.
- Use one image only. Extra images fall into the text column and often make the slide unstable.
- Expect `object-fit: cover`: the image fills its cell and may crop edges. Use screenshots with safe margins around important UI.
- Prefer `.half-bleed` for sparse content because it fills the full canvas intentionally.

## Screenshot Rules

Screenshots are evidence, not decoration.

- Preserve readable UI details. If the screenshot becomes too small, split the slide or crop to the relevant region.
- Use `.screenshot-shadow` for a single product/result image inside a normal slide.
- Add a caption when the screenshot proves a claim, shows a result, or will matter in DOCX handoff.
- For before/after screenshots, use `.compare` with equal-length labels and captions.
- For multi-step UI, use one screenshot per step across multiple pages or a `.timeline` with short labels.

Example:

```markdown
## Before and After {: .compare}

### Before
![old preview with overflow](./assets/before.png){: .screenshot-shadow}
Caption: The preview clipped the lower toolbar at narrow widths.

### After
![new preview with stable toolbar](./assets/after.png){: .screenshot-shadow}
Caption: The toolbar remains visible and the page stack scrolls normally.
```

## Diagram Rules

- Use landscape orientation for wide architecture diagrams, process maps, and system flows.
- Keep diagrams as standalone visuals when labels must remain readable.
- If the diagram needs more than one explanatory paragraph, split: first the diagram, then an interpretation slide.
- Avoid placing dense diagrams inside `.three-column` or small cards.
- If a diagram has many labels, prefer a normal full-width image section with a caption over `.half-bleed`.

## Photo / Generated Image Rules

- Use photos and generated images when they communicate the subject, place, product state, or mood required by the brief.
- Use cover/dark/half-bleed layouts for editorial photos.
- Do not crop away the actual subject. Keep faces, products, UI states, and important objects inside the safe center.
- Avoid purely atmospheric filler in technical/report decks.
- If text sits over an image, verify contrast in the rendered artifact. Prefer a dark slide or separate text column over fragile text-on-photo.

## Multi-Image Limits

| Count | Recommended treatment |
| ---: | --- |
| 1 | `.half-bleed`, `.spotlight`, normal image + caption, or `.screenshot-shadow` |
| 2 | `.compare` or `.two-column`; keep both images similar scale |
| 3 | `.three-column`; use short labels only |
| 4-6 | Split across pages, use `.agenda`/`.timeline` plus selected screenshots, or make a gallery only if captions are tiny |
| 7+ | Do not put all images on one slide; create a sequence or appendix |

## Caption And Alt Text

Use alt text for accessibility and captions for interpretation.

```markdown
![ranked search result table with the expected document at rank 1](./assets/search-result.png)
Caption: Contextual retrieval moved `DOC-SEMANTIC-GLASS` from missing to rank 1.
```

- Alt text should describe what is visible.
- Caption should explain why the image matters.
- Do not use filenames as alt text.
- Do not hide important caveats only in captions if the document may be read without images.

## Fit And Crop Safety

- Critical UI, labels, and data should sit inside the central 80% of the image.
- Avoid screenshots with tiny text when the slide already has body text.
- Use cropped screenshots to highlight a region, but keep enough surrounding UI to orient the reader.
- For `.half-bleed`, test both desktop and narrow preview because the layout stacks on small screens.
- Missing local images should not block conversion, but a final artifact with unresolved image fallbacks is not production-ready unless explicitly accepted.

## Anti-Patterns

- Image collage used as proof when individual screenshots are unreadable.
- Three unrelated images in `.compare`.
- Full-bleed decorative image on a technical evidence slide.
- Caption separated onto the next page.
- Multiple screenshots plus long prose on one slide.
- Image-only slide with no Markdown explanation.
- Raw `<img>`, `<figure>`, `<div>`, or inline CSS for layout.

## Verification Checklist

- [ ] Every important image has meaningful alt text.
- [ ] Evidence images have captions.
- [ ] Image and explanation remain on the same page.
- [ ] `.half-bleed` slides use exactly one hero image.
- [ ] Screenshots remain readable at the rendered slide scale.
- [ ] No important content is cropped by `object-fit: cover`.
- [ ] Desktop and narrow/mobile previews have no overlap, clipping, or broken image fallback.
- [ ] Image choices trace to the request contract, not generic decoration.
