import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-dark-contrast-'));
const inputPath = path.join(tmpDir, 'dark-contrast.md');
const outputPath = path.join(tmpDir, 'dark-contrast.html');

const md = `---
title: Dark Contrast Guard
theme: report
pageWidth: 1120px
pageHeight: 720px
---

## Why Tooling Matters {: .message .dark}

Older LLM apps answered questions. Coding agents change files, run commands, and create tickets, so the interface must keep readable context visible.

The real cost moved from text quality to side effects.

---
{: .page-break}

## Close {: .dark}

Muted context should still be readable on dark slides.
`;

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  assert(match, `Expected hex color, got ${hex}`);
  return match.slice(1).map((part) => Number.parseInt(part, 16) / 255);
}

function channelToLinear(value) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

await fs.writeFile(inputPath, md, 'utf8');
await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  outputPath,
  '--standalone',
  '--base-dir',
  tmpDir,
]);

const html = await fs.readFile(outputPath, 'utf8');
const css = await fs.readFile(path.join(repoRoot, 'public', 'document.css'), 'utf8');
const extensionCss = await fs.readFile(path.join(repoRoot, 'vscode-extension', 'public', 'document.css'), 'utf8');
const validationRules = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'references', 'validation-rules.md'),
  'utf8',
);
const extensionValidationRules = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'references', 'validation-rules.md'),
  'utf8',
);
const advisorHarness = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'document-production-advisor', 'references', 'request-fulfillment-harness.md'),
  'utf8',
);
const extensionAdvisorHarness = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'ai_skills', 'shared', 'skills', 'document-production-advisor', 'references', 'request-fulfillment-harness.md'),
  'utf8',
);

assert(html.includes('section-dark template-message'), 'message + dark should preserve section-dark class');
assert(html.includes('template-dark-slide'), 'plain .dark should render as the dark slide template');
assert(css.includes('--doc-inverse-bg: #111827;'), 'dark surfaces should use a predictable high-contrast background');
assert(css.includes('--doc-inverse-muted: #dbe4f0;'), 'dark surfaces should define readable body text');
assert(css.includes('--doc-inverse-subtle: #cbd5e1;'), 'dark surfaces should define readable muted text');
assert(css.includes('.template-message.section-dark .md-paragraph:first-child'), 'message + dark should override lead paragraph color');
assert(css.includes('.section-dark .md-paragraph,'), 'generic dark sections should override paragraph color');
assert(css.includes('.section-dark code,'), 'dark sections should override inline code colors');
assert(extensionCss.includes('--doc-inverse-muted: #dbe4f0;'), 'extension CSS should bundle readable dark body text');
assert(extensionCss.includes('.template-message.section-dark .md-paragraph:first-child'), 'extension CSS should bundle message + dark contrast override');
assert(contrastRatio('#dbe4f0', '#111827') >= 4.5, 'inverse body text should pass WCAG AA on dark background');
assert(contrastRatio('#cbd5e1', '#111827') >= 4.5, 'inverse muted text should pass WCAG AA when it carries meaning');
assert(validationRules.includes('Color / Font Contrast Harness'), 'composer validation should include the contrast harness');
assert(validationRules.includes('meaningful muted text'), 'composer validation should treat muted text as meaningful content');
assert(extensionValidationRules.includes('Color / Font Contrast Harness'), 'extension composer validation should include the contrast harness');
assert(advisorHarness.includes('color/font contrast checked after render'), 'advisor harness should require post-render contrast checks');
assert(extensionAdvisorHarness.includes('color/font contrast checked after render'), 'extension advisor harness should require post-render contrast checks');

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('dark slide contrast guard ok');
