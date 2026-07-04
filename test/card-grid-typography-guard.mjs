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
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-card-grid-'));
const inputPath = path.join(tmpDir, 'card-grid.md');
const outputPath = path.join(tmpDir, 'card-grid.html');

const md = `---
title: Card Grid Typography Guard
theme: report
pageWidth: 1120px
pageHeight: 720px
---

## Capability Map {: .feature-grid}

- **Execution**: tools, virtual filesystem, sandbox permissions
- **Context**: memory, skills, summarization, offloading
- **Delegation**: todos, subagents, context isolation

---
{: .page-break}

## Deep Agents Layers {: .three-column}

### Execution environment
L1

tools, virtual filesystem, sandbox permissions

### Context management
L2

memory, skills, summarization, offloading

### Delegation
L3

todos, subagents, context isolation
`;

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
const extensionCss = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'public', 'document.css'),
  'utf8',
);
const previewEnhancements = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'src', 'webview', 'previewEnhancements.ts'),
  'utf8',
);
const composerSkill = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'SKILL.md'),
  'utf8',
);
const advisorSkill = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'document-production-advisor', 'SKILL.md'),
  'utf8',
);
const bundledComposerSkill = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'SKILL.md'),
  'utf8',
);
const bundledAdvisorSkill = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'ai_skills', 'shared', 'skills', 'document-production-advisor', 'SKILL.md'),
  'utf8',
);
const imagePlacementRules = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'references', 'image-placement-rules.md'),
  'utf8',
);
const bundledImagePlacementRules = await fs.readFile(
  path.join(repoRoot, 'vscode-extension', 'ai_skills', 'shared', 'skills', 'md-presentation-composer', 'references', 'image-placement-rules.md'),
  'utf8',
);

assert(html.includes('section-feature-grid'), 'feature-grid should render with its section class');
assert(html.includes('template-columns cols-3'), 'three-column sections should render through the column template');
assert(css.includes('--font-size-card-heading'), 'document CSS should define a card heading type token');
assert(extensionCss.includes('--font-size-card-heading'), 'VS Code bundled CSS should include the card heading type token');
assert(css.includes('repeat(auto-fit, minmax(min(100%, 15rem), 1fr))'), 'card grids should use responsive auto-fit columns');
assert(extensionCss.includes('repeat(auto-fit, minmax(min(100%, 15rem), 1fr))'), 'VS Code bundled CSS should use responsive auto-fit columns');
assert(css.includes('.template-columns .column > .md-section .section-heading'), 'nested column cards should scale their own headings');
assert(extensionCss.includes('.template-columns .column > .md-section .section-heading'), 'VS Code bundled CSS should scale nested column card headings');
assert(css.includes('word-break: keep-all'), 'document CSS should avoid aggressive letter-level breaks');
assert.match(css, /\.md-paragraph \{[\s\S]*?overflow-wrap: break-word;[\s\S]*?word-break: keep-all;[\s\S]*?\}/);
assert.match(css, /\.md-list \{[\s\S]*?overflow-wrap: break-word;[\s\S]*?word-break: keep-all;[\s\S]*?\}/);
assert(previewEnhancements.includes('repeat(auto-fit, minmax(min(100%, 15rem), 1fr))'), 'VS Code preview overrides should preserve responsive columns');
assert(previewEnhancements.includes('word-break: keep-all'), 'VS Code narrow preview should avoid aggressive text breaking');
assert(composerSkill.includes('Card and grid titles must not split awkwardly'), 'composer skill should warn against broken card titles');
assert(advisorSkill.includes('For richer cards, prefer bold labels inside list items'), 'advisor skill should show safer feature-grid authoring');
assert(bundledComposerSkill.includes('Card and grid titles must not split awkwardly'), 'VS Code bundled composer skill should include card title guidance');
assert(bundledAdvisorSkill.includes('For richer cards, prefer bold labels inside list items'), 'VS Code bundled advisor skill should include safer feature-grid authoring');
assert(composerSkill.includes('references/image-placement-rules.md'), 'composer skill should route image-heavy documents to image placement rules');
assert(bundledComposerSkill.includes('references/image-placement-rules.md'), 'VS Code bundled composer skill should route image-heavy documents to image placement rules');
for (const rules of [imagePlacementRules, bundledImagePlacementRules]) {
  assert(rules.includes('Placement Decision Matrix'), 'image placement rules should include a decision matrix');
  assert(rules.includes('`.half-bleed` Rules'), 'image placement rules should include half-bleed guidance');
  assert(rules.includes('Multi-Image Limits'), 'image placement rules should include multi-image limits');
  assert(rules.includes('Verification Checklist'), 'image placement rules should include render verification checks');
}

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('card grid typography guard ok');
