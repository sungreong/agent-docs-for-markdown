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
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-briefing-expression-'));
const inputPath = path.join(tmpDir, 'briefing-expression.md');
const outputPath = path.join(tmpDir, 'briefing-expression.html');

const md = `
## Lead Brief {: .briefing-lead}
The most important finding or decision point appears before background.

## Priority Points {: .priority-strip}
- Confirmed point
- Reader impact
- Open question

## Evidence Checked {: .evidence-ledger}
- Source | What it supports | Link/date
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
const skill = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'codex', 'skills', 'document-production-advisor', 'SKILL.md'),
  'utf8',
);

assert(html.includes('section-briefing-lead'), 'briefing-lead class should render as section-briefing-lead');
assert(html.includes('section-priority-strip'), 'priority-strip class should render as section-priority-strip');
assert(html.includes('section-evidence-ledger'), 'evidence-ledger class should render as section-evidence-ledger');
assert(css.includes('.section-briefing-lead'), 'document CSS should include manual briefing lead styling');
assert(css.includes('.section-priority-strip'), 'document CSS should include manual priority strip styling');
assert(css.includes('.section-evidence-ledger'), 'document CSS should include manual evidence ledger styling');
assert(skill.includes('Briefing / Priority Writing Concepts'), 'document-production-advisor should include generic briefing guidance');
assert(skill.includes('.priority-strip'), 'document-production-advisor should mention priority-strip');

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('briefing-expression-classes-guard ok');
