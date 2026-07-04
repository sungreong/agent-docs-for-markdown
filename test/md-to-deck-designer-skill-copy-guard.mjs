import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skillFiles = [
  'ai_skills/shared/skills/md-to-deck-designer/SKILL.md',
  'vscode-extension/ai_skills/shared/skills/md-to-deck-designer/SKILL.md',
];

const sourceContractFiles = [
  'ai_skills/shared/skills/md-to-deck-designer/references/source-contract.md',
  'vscode-extension/ai_skills/shared/skills/md-to-deck-designer/references/source-contract.md',
];

const deckExecutionFiles = [
  'ai_skills/shared/skills/md-to-deck-designer/references/deck-execution.md',
  'vscode-extension/ai_skills/shared/skills/md-to-deck-designer/references/deck-execution.md',
];

await assertCopiesMatch(skillFiles, 'md-to-deck-designer SKILL.md');
await assertCopiesMatch(sourceContractFiles, 'md-to-deck-designer source contract reference');
await assertCopiesMatch(deckExecutionFiles, 'md-to-deck-designer deck execution reference');

const canonicalSkill = await readNormalized(skillFiles[0]);
for (const expected of [
  'Presentations',
  'md-presentation-composer',
  'Pure Markdown is enough',
  'Pure Markdown is not enough',
  'slide-count policy',
  'temporary rendering layer',
  'Render every slide preview',
]) {
  assert(canonicalSkill.includes(expected), `md-to-deck-designer skill should mention ${expected}`);
}

console.log('md-to-deck-designer skill copy guard passed');

async function assertCopiesMatch(paths, label) {
  const [canonicalPath, ...copyPaths] = paths;
  const canonical = await readNormalized(canonicalPath);
  for (const copyPath of copyPaths) {
    assert.equal(await readNormalized(copyPath), canonical, `${label} drifted between ${canonicalPath} and ${copyPath}`);
  }
}

async function readNormalized(path) {
  return (await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
}
