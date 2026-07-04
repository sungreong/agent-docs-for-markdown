import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-audit-'));
const scriptPath = path.join(repoRoot, 'scripts', 'source-graph.mjs');

try {
  await fs.mkdir(path.join(tmpRoot, 'docs'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, 'test'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, 'ignored'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, '.codex', 'skills', 'markdown-context-packager'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, '.claude', 'skills', 'markdown-context-packager'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, '.gemini', 'skills', 'markdown-context-packager'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, 'ai_skills', 'shared', 'skills', 'markdown-context-packager'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, '.mps'), { recursive: true });

  await fs.writeFile(path.join(tmpRoot, '.mps', '.mpsignore'), ['.claude/**', 'ignored/**', ''].join('\n'), 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'README.md'), '# Home\n\n[Guide](docs/guide.md)\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'docs', 'guide.md'), '# Guide\n\n[Missing](missing.md)\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'notes.draft.md'), '# Draft\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'test', 'fixture.md'), '# Fixture\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'ignored', 'hidden.md'), '# Hidden\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, '.codex', 'skills', 'markdown-context-packager', 'SKILL.md'), '# Skill\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, '.claude', 'skills', 'markdown-context-packager', 'SKILL.md'), '# Skill\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, '.gemini', 'skills', 'markdown-context-packager', 'SKILL.md'), '# Skill\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'ai_skills', 'shared', 'skills', 'markdown-context-packager', 'SKILL.md'), '# Skill\n', 'utf8');

  const audit = JSON.parse(runCli(['audit', '--root', tmpRoot]));
  assert(audit.ignore.userPatterns.includes('.claude/**'), 'expected user ignore patterns to include .claude/**');
  assert(audit.ignore.userPatterns.includes('ignored/**'), 'expected user ignore patterns to include ignored/**');

  const codexRecommendation = audit.ignore.recommendations.find((item) => item.pattern === '.codex/**');
  assert(codexRecommendation?.status === 'candidate', 'expected .codex recommendation to be a candidate');
  assert(codexRecommendation?.indexedCount === 1, 'expected .codex recommendation indexed count');

  const geminiRecommendation = audit.ignore.recommendations.find((item) => item.pattern === '.gemini/**');
  assert(geminiRecommendation?.status === 'candidate', 'expected .gemini recommendation to be a candidate');

  const claudeRecommendation = audit.ignore.recommendations.find((item) => item.pattern === '.claude/**');
  assert(claudeRecommendation?.status === 'already-ignored', 'expected .claude recommendation to report already-ignored');

  const testRecommendation = audit.ignore.recommendations.find((item) => item.pattern === 'test/**');
  assert(testRecommendation?.indexedCount === 1, 'expected test recommendation to include the markdown fixture');

  assert(
    audit.ignore.reviewItems.some((item) => item.path === 'notes.draft.md' && item.suggestedPattern === '*.draft.md'),
    'expected draft review item with *.draft.md suggestion',
  );
  assert(
    audit.graph.unresolvedLinks.some((item) => item.sourcePath === 'docs/guide.md' && item.href === 'missing.md'),
    'expected unresolved internal link in audit output',
  );
  assert(
    audit.graph.duplicateCopyGroups.some((item) => item.key === 'skill:markdown-context-packager/skill.md' && item.count >= 3),
    'expected duplicate skill copy group in audit output',
  );
  const cachePath = path.join(tmpRoot, '.mps', 'source-graph-audit-cache.json');
  await fs.access(cachePath);
  const cachedAudit = JSON.parse(runCli(['audit', '--root', tmpRoot]));
  assert(
    cachedAudit.notes.some((note) => note.includes('reused from the .mps cache')),
    'expected repeated audit to reuse the inventory-derived audit cache',
  );
  await fs.writeFile(path.join(tmpRoot, '.mps', '.mpsignore'), ['.claude/**', '.codex/**', 'ignored/**', ''].join('\n'), 'utf8');
  const invalidatedAudit = JSON.parse(runCli(['audit', '--root', tmpRoot]));
  assert(
    invalidatedAudit.notes.some((note) => note.includes('refreshed from the current workspace inventory')),
    'expected .mps/.mpsignore changes to invalidate the audit inventory cache',
  );
  assert(
    invalidatedAudit.ignore.recommendations.find((item) => item.pattern === '.codex/**')?.status === 'already-ignored',
    'expected changed .mps/.mpsignore rules to be reflected after cache invalidation',
  );

  const summaryAudit = JSON.parse(runCli(['audit', '--root', tmpRoot, '--summary-only', '--no-auto-update']));
  assert(summaryAudit.mode === 'summary-only', 'expected summary-only audit mode');
  assert(summaryAudit.summary.indexedDocuments === audit.summary.indexedDocuments, 'expected summary-only indexed document count to match full audit');
  assert(summaryAudit.summary.unresolvedInternalLinks === audit.summary.unresolvedInternalLinks, 'expected summary-only unresolved link count to match full audit');
  assert(summaryAudit.summary.orphanDocuments >= audit.summary.orphanDocuments, 'expected summary-only orphan aggregate to include at least listed orphan documents');
  assert(!summaryAudit.ignore && !summaryAudit.graph, 'expected summary-only audit to skip full inventory payloads');
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

console.log('source graph audit guard passed');

function runCli(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`source graph CLI failed for ${args.join(' ')}:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
