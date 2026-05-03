#!/usr/bin/env node
import fs from 'node:fs/promises';
import { BRAND_DESIGN_LIST, getBrandDesign } from '../public/core/brand-designs.js';
import { parseMarkdownDocument, registerBuiltInTemplates, renderDocument } from '../public/core/engine.js';
import { analyzeMarkdownQuality } from '../public/core/quality.js';
import { TemplateRegistry } from '../public/core/registry.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasFontFallback(value = '') {
  return /(system-ui|sans-serif|serif|monospace|ui-monospace)\b/i.test(String(value || ''));
}

function dist(hexA, hexB) {
  const a = String(hexA || '').replace('#', '');
  const b = String(hexB || '').replace('#', '');
  const channelsA = [0, 2, 4].map((index) => parseInt(a.slice(index, index + 2), 16));
  const channelsB = [0, 2, 4].map((index) => parseInt(b.slice(index, index + 2), 16));
  return Math.sqrt(channelsA.reduce((sum, value, index) => sum + (value - channelsB[index]) ** 2, 0));
}

assert(BRAND_DESIGN_LIST.length === 70, `Expected 70 brand design presets, got ${BRAND_DESIGN_LIST.length}`);

const missingFallback = BRAND_DESIGN_LIST.filter((design) => {
  return !hasFontFallback(design.cssVars?.['--font-heading']) || !hasFontFallback(design.cssVars?.['--font-body']);
});
assert(!missingFallback.length, `Missing font fallback: ${missingFallback.map((item) => item.slug).join(', ')}`);

const stripe = getBrandDesign('stripe');
assert(stripe.cssVars['--doc-bg'] === '#ffffff', `Stripe canvas should stay white, got ${stripe.cssVars['--doc-bg']}`);
assert(stripe.cssVars['--doc-text'] === '#061b31', `Stripe text should be deep navy, got ${stripe.cssVars['--doc-text']}`);
assert(stripe.cssVars['--doc-accent'] === '#533afd', `Stripe accent should be purple, got ${stripe.cssVars['--doc-accent']}`);
assert(stripe.cssVars['--doc-inverse-bg'] === '#533afd', `Stripe inverse background should use accent, got ${stripe.cssVars['--doc-inverse-bg']}`);

const bugatti = getBrandDesign('bugatti');
assert(bugatti.cssVars['--doc-bg'] === '#000000', `Bugatti canvas should stay black, got ${bugatti.cssVars['--doc-bg']}`);
assert(bugatti.cssVars['--doc-inverse-bg'] === '#000000', `Bugatti inverse background should stay black, got ${bugatti.cssVars['--doc-inverse-bg']}`);

const nonMonoCollisions = BRAND_DESIGN_LIST.filter((design) => {
  return design.archetype !== 'monochrome-precision' && dist(design.cssVars['--doc-bg'], design.cssVars['--doc-accent']) < 30;
});
assert(!nonMonoCollisions.length, `Non-monochrome bg/accent collisions: ${nonMonoCollisions.map((item) => item.slug).join(', ')}`);

const sample = `---
title: Brand Review
design: stripe
toc: false
---

# Brand Review {#cover .cover .dark eyebrow="Q2"}

One clear executive message.

---
{: .page-break}

## Metrics {: .stats}

- Adoption | 70% | +12
- Quality | 96% | +4
`;

const model = parseMarkdownDocument(sample);
const registry = new TemplateRegistry();
registerBuiltInTemplates(registry);
const html = renderDocument(model, { mode: 'paginated' }, registry);
assert(html.includes('design-stripe'), 'Rendered document is missing design-stripe class');
assert(html.includes('intent-pitch'), 'Rendered document should inherit Stripe recommended intent');
assert(html.includes('--doc-inverse-bg:#533afd'), 'Rendered document is missing Stripe inverse background var');
assert(html.includes('section-cover section-dark template-cover'), 'Dark cover classes did not survive rendering');

const quality = analyzeMarkdownQuality('---\ndesign: unknown-brand\n---\n\n# Demo', parseMarkdownDocument('---\ndesign: unknown-brand\n---\n\n# Demo'));
assert(quality.issues.some((item) => item.title.includes('DESIGN.md')), 'Unknown design preset warning missing');

const documentCss = await fs.readFile(new URL('../public/document.css', import.meta.url), 'utf8');
assert(documentCss.includes('.template-cover.section-dark'), 'Dark cover CSS is missing');
assert(documentCss.includes('background: var(--doc-inverse-bg)'), 'Dark cover/dark slide inverse background CSS is missing');

const standalone = await fs.readFile(new URL('../public/core/export-standalone.js', import.meta.url), 'utf8');
assert(standalone.includes("outline.classList.add('is-collapsed')"), 'Standalone slide outline should default to collapsed');

console.log('brand-design-integration ok');
