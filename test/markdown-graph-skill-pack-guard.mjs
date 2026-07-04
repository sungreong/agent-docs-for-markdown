import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const skillNames = [
  'markdown-workspace-search',
  'markdown-graph-triage',
  'markdown-ignore-advisor',
  'markdown-context-packager',
  'markdown-update-planner',
  'markdown-canonicalizer',
  'markdown-link-repair',
];

const routerSkillNames = [
  'markdown-manager',
];

const roots = [
  'ai_skills/shared/skills',
  'vscode-extension/ai_skills/shared/skills',
];

for (const root of roots) {
  for (const skill of routerSkillNames) {
    const skillPath = path.join(repoRoot, root, skill, 'SKILL.md');
    await assertExists(skillPath, `${root}/${skill}/SKILL.md`);
    await assertExists(path.join(repoRoot, root, skill, 'agents', 'openai.yaml'), `${root}/${skill}/agents/openai.yaml`);
    await assertExists(path.join(repoRoot, root, skill, 'scripts', 'source-graph.mjs'), `${root}/${skill}/scripts/source-graph.mjs`);
  }
  for (const skill of skillNames) {
    const skillPath = path.join(repoRoot, root, skill, 'SKILL.md');
    await assertExists(skillPath, `${root}/${skill}/SKILL.md`);
    await assertExists(path.join(repoRoot, root, skill, 'agents', 'openai.yaml'), `${root}/${skill}/agents/openai.yaml`);
    await assertExists(path.join(repoRoot, root, skill, 'scripts', 'source-graph.mjs'), `${root}/${skill}/scripts/source-graph.mjs`);
    await assertExists(
      path.join(repoRoot, root, skill, 'references', 'markdown-graph-skill-map.md'),
      `${root}/${skill}/references/markdown-graph-skill-map.md`,
    );
  }
}

const searchSkill = await fs.readFile(path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-workspace-search', 'SKILL.md'), 'utf8');
const managerSkill = await fs.readFile(path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-manager', 'SKILL.md'), 'utf8');
const triageSkill = await fs.readFile(path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-graph-triage', 'SKILL.md'), 'utf8');
const ignoreSkill = await fs.readFile(path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-ignore-advisor', 'SKILL.md'), 'utf8');
const updatePlannerSkill = await fs.readFile(path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-update-planner', 'SKILL.md'), 'utf8');
const searchScript = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-workspace-search', 'scripts', 'source-graph.mjs'),
  'utf8',
);
const skillMap = await fs.readFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-graph-triage', 'references', 'markdown-graph-skill-map.md'),
  'utf8',
);

assert(managerSkill.includes('## Routing'), 'markdown-manager should route Markdown requests to internal workflows');
assert(managerSkill.includes('markdown-workspace-search'), 'markdown-manager should route search requests');
assert(managerSkill.includes('markdown-link-repair'), 'markdown-manager should route link repair requests');
assert(managerSkill.includes('md-presentation-composer'), 'markdown-manager should route writing requests');
assert(managerSkill.includes('document-production-advisor'), 'markdown-manager should route export QA requests');
assert(managerSkill.includes('.codex/skills/markdown-manager/scripts/source-graph.mjs'), 'markdown-manager should prefer its bundled script');
assert(managerSkill.includes('Do not assume the user'), 'markdown-manager should not assume workspace scripts exist');
assert(searchSkill.includes('references/markdown-graph-skill-map.md'), 'markdown-workspace-search should route to companion graph skills');
assert(searchSkill.includes('OS-Aware Execution'), 'markdown-workspace-search should document OS-aware commands');
assert(searchSkill.includes('Large Output Rule'), 'markdown-workspace-search should document persisted-output handling');
assert(searchSkill.includes('--compact --heading-limit 5'), 'markdown-workspace-search should recommend compact first-pass searches');
assert(searchSkill.includes('--output <path>'), 'markdown-workspace-search should document output files');
assert(searchSkill.includes('Windows PowerShell'), 'markdown-workspace-search should include Windows PowerShell examples');
assert(searchSkill.includes('Tool Choice Rule'), 'markdown-workspace-search should teach tool choice');
assert(searchSkill.includes('Use `rg` first when'), 'markdown-workspace-search should allow rg for simple discovery');
assert(searchSkill.includes('The best flow is often hybrid'), 'markdown-workspace-search should teach rg seed plus graph expansion');
assert(searchSkill.includes('macOS/Linux shell'), 'markdown-workspace-search should include macOS/Linux examples');
assert(searchScript.includes('process.platform'), 'portable source graph script should detect the OS');
assert(triageSkill.includes('node scripts/source-graph.mjs audit --root .'), 'markdown-graph-triage should require audit');
assert(triageSkill.includes('URL/link relationships'), 'markdown-graph-triage should trigger for general Markdown graph analysis');
assert(triageSkill.includes('Evidence Collection'), 'markdown-graph-triage should explain when to use rg vs Source Graph');
assert(ignoreSkill.includes('.mpsignore'), 'markdown-ignore-advisor should mention .mpsignore');
assert(ignoreSkill.includes('Markdown search'), 'markdown-ignore-advisor should trigger for Markdown search noise');
assert(ignoreSkill.includes('Evidence Collection'), 'markdown-ignore-advisor should explain when to use rg vs Source Graph');
assert(updatePlannerSkill.includes('node scripts/source-graph.mjs neighbors --root .'), 'markdown-update-planner should use neighbors');
assert(updatePlannerSkill.includes('URL references'), 'markdown-update-planner should handle URL/link relationship work');
assert(updatePlannerSkill.includes('Evidence Collection'), 'markdown-update-planner should explain when to use rg vs Source Graph');
for (const skill of skillNames) {
  assert(skillMap.includes(skill), `skill map should explain ${skill}`);
}

const portableRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-markdown-skill-portable-'));
await fs.mkdir(path.join(portableRoot, '.codex', 'skills', 'markdown-workspace-search', 'scripts'), { recursive: true });
await fs.mkdir(path.join(portableRoot, 'docs'), { recursive: true });
await fs.copyFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-workspace-search', 'scripts', 'source-graph.mjs'),
  path.join(portableRoot, '.codex', 'skills', 'markdown-workspace-search', 'scripts', 'source-graph.mjs'),
);
await fs.mkdir(path.join(portableRoot, '.agents', 'skills', 'md-presentation-composer', 'references'), { recursive: true });
await fs.writeFile(path.join(portableRoot, 'README.md'), '# Home\n\nSee [Guide](docs/guide.md).\n', 'utf8');
await fs.writeFile(path.join(portableRoot, 'docs', 'guide.md'), '# Guide\n\nPortableFallbackToken\n', 'utf8');
await fs.writeFile(
  path.join(portableRoot, '.agents', 'skills', 'md-presentation-composer', 'references', 'noise.md'),
  '# Skill Noise\n\nPortableFallbackToken should not dominate normal search.\n',
  'utf8',
);

const portableUpdate = spawnSync(process.execPath, ['.codex/skills/markdown-workspace-search/scripts/source-graph.mjs', 'update', '--root', '.'], {
  cwd: portableRoot,
  encoding: 'utf8',
});
assert(portableUpdate.status === 0, `portable source graph update should work without workspace CLI:\n${portableUpdate.stderr || portableUpdate.stdout}`);
const portableSearch = spawnSync(
  process.execPath,
  [
    '.codex/skills/markdown-workspace-search/scripts/source-graph.mjs',
    'search',
    '--root',
    '.',
    '--query',
    'PortableFallbackToken',
    '--include-headings',
    '--compact',
    '--heading-limit',
    '5',
  ],
  { cwd: portableRoot, encoding: 'utf8' },
);
assert(portableSearch.status === 0, `portable source graph search should work without workspace CLI:\n${portableSearch.stderr || portableSearch.stdout}`);
const portableResults = JSON.parse(portableSearch.stdout);
assert(portableResults.some((doc) => doc.path === 'docs/guide.md'), 'portable fallback should find Markdown body matches');
assert(!portableResults[0].id, 'portable compact results should omit bulky document metadata');
assert(
  !portableResults.some((doc) => doc.path.includes('.agents/skills')),
  'portable fallback should exclude local agent skill copies by default',
);
const portableCopiesSearch = spawnSync(
  process.execPath,
  [
    '.codex/skills/markdown-workspace-search/scripts/source-graph.mjs',
    'search',
    '--root',
    '.',
    '--query',
    'PortableFallbackToken',
    '--include-copies',
  ],
  { cwd: portableRoot, encoding: 'utf8' },
);
assert(portableCopiesSearch.status === 0, `portable source graph include-copies search should work:\n${portableCopiesSearch.stderr || portableCopiesSearch.stdout}`);
const portableCopiesResults = JSON.parse(portableCopiesSearch.stdout);
assert(
  portableCopiesResults.some((doc) => doc.path.includes('.agents/skills')),
  'portable fallback should include local agent skill copies with --include-copies',
);
const portableAudit = spawnSync(process.execPath, ['.codex/skills/markdown-workspace-search/scripts/source-graph.mjs', 'audit', '--root', '.', '--summary-only'], {
  cwd: portableRoot,
  encoding: 'utf8',
});
assert(portableAudit.status === 0, `portable source graph audit should report runtime information:\n${portableAudit.stderr || portableAudit.stdout}`);
const portableAuditResult = JSON.parse(portableAudit.stdout);
assert(portableAuditResult.runtime?.platform, 'portable fallback audit should include runtime.platform');
const portableOutput = spawnSync(
  process.execPath,
  [
    '.codex/skills/markdown-workspace-search/scripts/source-graph.mjs',
    'search',
    '--root',
    '.',
    '--query',
    'PortableFallbackToken',
    '--output',
    '.mps/portable-search.json',
  ],
  { cwd: portableRoot, encoding: 'utf8' },
);
assert(portableOutput.status === 0, `portable source graph --output should work:\n${portableOutput.stderr || portableOutput.stdout}`);
const portableOutputMeta = JSON.parse(portableOutput.stdout);
assert(portableOutputMeta.outputPath.endsWith('portable-search.json'), 'portable --output should print saved output metadata');
await assertExists(path.join(portableRoot, '.mps', 'portable-search.json'), 'portable search output file');
await fs.rm(portableRoot, { recursive: true, force: true });

const managerPortableRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-manager-skill-portable-'));
await fs.mkdir(path.join(managerPortableRoot, '.codex', 'skills', 'markdown-manager', 'scripts'), { recursive: true });
await fs.mkdir(path.join(managerPortableRoot, 'docs'), { recursive: true });
await fs.copyFile(
  path.join(repoRoot, 'ai_skills', 'shared', 'skills', 'markdown-manager', 'scripts', 'source-graph.mjs'),
  path.join(managerPortableRoot, '.codex', 'skills', 'markdown-manager', 'scripts', 'source-graph.mjs'),
);
await fs.writeFile(path.join(managerPortableRoot, 'README.md'), '# Home\n\nSee [Guide](docs/guide.md).\n', 'utf8');
await fs.writeFile(path.join(managerPortableRoot, 'docs', 'guide.md'), '# Guide\n\nManagerPortableFallbackToken\n', 'utf8');
const managerPortableSearch = spawnSync(
  process.execPath,
  [
    '.codex/skills/markdown-manager/scripts/source-graph.mjs',
    'search',
    '--root',
    '.',
    '--query',
    'ManagerPortableFallbackToken',
    '--compact',
  ],
  { cwd: managerPortableRoot, encoding: 'utf8' },
);
assert(
  managerPortableSearch.status === 0,
  `markdown-manager bundled source graph should work without workspace scripts/source-graph.mjs:\n${managerPortableSearch.stderr || managerPortableSearch.stdout}`,
);
const managerPortableResults = JSON.parse(managerPortableSearch.stdout);
assert(managerPortableResults.some((doc) => doc.path === 'docs/guide.md'), 'markdown-manager portable fallback should find Markdown body matches');
await fs.rm(managerPortableRoot, { recursive: true, force: true });

console.log('markdown graph skill pack guard passed');

async function assertExists(targetPath, label) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`missing ${label}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
