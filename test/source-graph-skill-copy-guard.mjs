import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skillFiles = [
  'ai_skills/codex/skills/markdown-workspace-search/SKILL.md',
  'ai_skills/agents/skills/markdown-workspace-search/SKILL.md',
  'ai_skills/claude/skills/markdown-workspace-search/SKILL.md',
  'vscode-extension/ai_skills/codex/skills/markdown-workspace-search/SKILL.md',
  'vscode-extension/ai_skills/agents/skills/markdown-workspace-search/SKILL.md',
  'vscode-extension/ai_skills/claude/skills/markdown-workspace-search/SKILL.md',
  '.codex/skills/markdown-workspace-search/SKILL.md',
  '.agents/skills/markdown-workspace-search/SKILL.md',
];

const referenceFiles = [
  'ai_skills/codex/skills/markdown-workspace-search/references/cli-commands.md',
  'ai_skills/agents/skills/markdown-workspace-search/references/cli-commands.md',
  'ai_skills/claude/skills/markdown-workspace-search/references/cli-commands.md',
  'vscode-extension/ai_skills/codex/skills/markdown-workspace-search/references/cli-commands.md',
  'vscode-extension/ai_skills/agents/skills/markdown-workspace-search/references/cli-commands.md',
  'vscode-extension/ai_skills/claude/skills/markdown-workspace-search/references/cli-commands.md',
  '.codex/skills/markdown-workspace-search/references/cli-commands.md',
  '.agents/skills/markdown-workspace-search/references/cli-commands.md',
];

await assertCopiesMatch(skillFiles, 'markdown-workspace-search SKILL.md');
await assertCopiesMatch(referenceFiles, 'markdown-workspace-search CLI commands reference');

const canonicalSkill = await readNormalized(skillFiles[0]);
for (const expected of [
  '.mps/source-graph.sqlite',
  'node scripts/source-graph.mjs search',
  '--include-links',
  '--links-depth 1',
  '--include-headings',
  '--include-copies',
  'Tool Choice Rule',
  'Node Requirement',
  'install-diagnostics',
  'node --version',
  'Use `rg` first when',
  'The best flow is often hybrid',
  'neighbors',
  'document intelligence, not code intelligence',
  'Heading evidence',
  'Link evidence',
  'Next action',
  'not a flat filename list',
]) {
  assert(canonicalSkill.includes(expected), `markdown-workspace-search skill should teach agents about ${expected}`);
}

const canonicalReference = await readNormalized(referenceFiles[0]);
for (const expected of [
  'node scripts/source-graph.mjs update',
  'node scripts/source-graph.mjs search',
  'node scripts/source-graph.mjs related',
  'node scripts/source-graph.mjs neighbors',
  '--include-headings',
  '--heading-limit',
  '--include-copies',
  'Tool Choice',
  'Use `rg` for exact raw text',
  'Hybrid pattern',
  'Missing Node',
  'install-diagnostics',
  'Workspace CLI search/related and portable fallback exclude these folders by default',
  'Heading evidence',
  'Link evidence',
  'Next action',
  'Avoid answering with only paths',
  '.codex',
  '.agents',
]) {
  assert(canonicalReference.includes(expected), `CLI commands reference should document ${expected}`);
}

console.log('markdown workspace search skill copy guard passed');

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
