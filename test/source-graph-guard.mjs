import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSourceGraphSqlite, searchSourceGraphSqlite } from '../public/core/source-graph-sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-'));

await fs.writeFile(
  path.join(tmpRoot, 'alpha.md'),
  [
    '# Alpha',
    '',
    'See [Beta](docs/beta.md) and [External][ext].',
    '',
    '[ext]: https://example.com/source',
  ].join('\n'),
  'utf8',
);
await fs.writeFile(path.join(tmpRoot, 'README.md'), '# Project Home\n\nREADME marker for the workspace root.\n', 'utf8');
await fs.mkdir(path.join(tmpRoot, 'docs'), { recursive: true });
await fs.writeFile(path.join(tmpRoot, 'docs', 'beta.md'), '# Beta\n\nBack to [[../alpha|Alpha]].\n', 'utf8');
await fs.writeFile(path.join(tmpRoot, 'docs', 'gamma.md'), '# Gamma\n\nLinked by basename.\n', 'utf8');
await fs.mkdir(path.join(tmpRoot, '.agents', 'skills', 'vibe-planning'), { recursive: true });
await fs.writeFile(path.join(tmpRoot, '.agents', 'skills', 'vibe-planning', 'README.md'), '# Skill Install\n\nREADME marker for a nested skill.\n', 'utf8');
await fs.mkdir(path.join(tmpRoot, '.codex', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
await fs.mkdir(path.join(tmpRoot, '.agents', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
await fs.mkdir(path.join(tmpRoot, 'ai_skills', 'codex', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
const copiedSkillReference = '# Source Graph CLI Commands\n\nUniqueDuplicatedCopyToken.\n\nSee [Alpha](/alpha.md).\n';
await fs.writeFile(path.join(tmpRoot, '.codex', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');
await fs.writeFile(path.join(tmpRoot, '.agents', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');
await fs.writeFile(path.join(tmpRoot, 'ai_skills', 'codex', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');

const scriptPath = path.join(repoRoot, 'scripts', 'source-graph.mjs');
const update = spawnSync(process.execPath, [scriptPath, 'update', '--root', tmpRoot, '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (update.status !== 0) {
  throw new Error(`source graph update failed:\n${update.stderr || update.stdout}`);
}

const dbPath = path.join(tmpRoot, '.mps', 'source-graph.sqlite');
const db = await readSourceGraphSqlite(dbPath);
assert(db.tables.documents.length === 8, 'expected markdown documents including duplicate skill copies');
assert(db.tables.links.some((link) => link.status === 'resolved' && link.targetPath === 'docs/beta.md'), 'expected resolved beta link');
assert(db.tables.links.some((link) => link.status === 'external'), 'expected external reference link');
const initialAlphaDocument = db.tables.documents.find((doc) => doc.path === 'alpha.md');
assert(initialAlphaDocument?.sourceHash, 'expected source graph documents to store sourceHash for mtime-only change detection');

const sqliteBodyResults = await searchSourceGraphSqlite(dbPath, 'UniqueDuplicatedCopyToken', { mode: 'body', limit: 10 });
assert(sqliteBodyResults.some((doc) => doc.path.includes('markdown-workspace-search/references/cli-commands.md')), 'expected sqlite fast body search to use search_index text');
const sqliteScopedBodyResults = await searchSourceGraphSqlite(dbPath, 'UniqueDuplicatedCopyToken', { mode: 'body', limit: 10, excludeSkillCopies: true });
assert(sqliteScopedBodyResults.length === 0, 'expected sqlite fast search to exclude skill copies when requested');
const sqlitePhraseResults = await searchSourceGraphSqlite(dbPath, 'Source Graph CLI Commands', { mode: 'body', limit: 3 });
assert(sqlitePhraseResults[0]?.path.includes('markdown-workspace-search/references/cli-commands.md'), 'expected sqlite exact phrase scoring to rank matching skill docs first');

const sqliteFileResults = await searchSourceGraphSqlite(dbPath, 'Back', { mode: 'file', limit: 10 });
assert(sqliteFileResults.length === 0, 'expected sqlite fast file search to ignore body-only text');

await fs.writeFile(
  path.join(tmpRoot, 'alpha.md'),
  [
    '# Alpha',
    '',
    'See [[Gamma]], [Gamma exact](docs/gamma.md), and [External][ext].',
    '',
    '[ext]: https://example.com/source',
  ].join('\n'),
  'utf8',
);

const partial = spawnSync(process.execPath, [scriptPath, 'update-file', '--root', tmpRoot, '--path', 'alpha.md', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (partial.status !== 0) {
  throw new Error(`source graph update-file failed:\n${partial.stderr || partial.stdout}`);
}
const partialDb = await readSourceGraphSqlite(dbPath);
const alphaLinks = partialDb.tables.links.filter((link) => link.sourcePath === 'alpha.md');
assert(alphaLinks.some((link) => link.status === 'resolved' && link.targetPath === 'docs/gamma.md'), 'expected exact gamma link to resolve');
assert(alphaLinks.some((link) => link.status === 'unresolved' && link.targetPath === 'Gamma'), 'expected basename-only wiki link to stay unresolved instead of guessing a document edge');
assert(!alphaLinks.some((link) => link.status === 'resolved-by-name'), 'expected document edges to avoid basename-only inferred matches');
assert(!alphaLinks.some((link) => link.targetPath === 'docs/beta.md'), 'expected old beta link to be removed after update-file');
const alphaAfterPartial = partialDb.tables.documents.find((doc) => doc.path === 'alpha.md');
assert(alphaAfterPartial?.sourceHash, 'expected update-file to preserve sourceHash on changed documents');

const sameAlphaSource = await fs.readFile(path.join(tmpRoot, 'alpha.md'), 'utf8');
const alphaMtimeBeforeNoop = alphaAfterPartial.mtimeMs;
await fs.writeFile(path.join(tmpRoot, 'alpha.md'), sameAlphaSource, 'utf8');
await fs.utimes(path.join(tmpRoot, 'alpha.md'), new Date(), new Date(Date.now() + 5000));
const noopSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'Alpha', '--limit', '1', '--freshness-ms', '0'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (noopSearch.status !== 0) {
  throw new Error(`source graph noop hash search failed:\n${noopSearch.stderr || noopSearch.stdout}`);
}
const noopDb = await readSourceGraphSqlite(dbPath);
const alphaAfterNoop = noopDb.tables.documents.find((doc) => doc.path === 'alpha.md');
assert(alphaAfterNoop.sourceHash === alphaAfterPartial.sourceHash, 'expected mtime-only change detection to keep the same sourceHash');
assert(alphaAfterNoop.mtimeMs === alphaMtimeBeforeNoop, 'expected mtime-only source hash match to skip update-file row rewrite');

const search = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'beta', '--links-depth', '2', '--include-headings'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (search.status !== 0) throw new Error(`source graph search failed:\n${search.stderr || search.stdout}`);
const results = JSON.parse(search.stdout);
assert(results.some((doc) => doc.path === 'docs/beta.md'), 'expected beta search result');
const betaResult = results.find((doc) => doc.path === 'docs/beta.md');
assert(betaResult.linksDepth === 2, 'expected search result links depth');
assert(betaResult.links.some((link) => link.sourcePath === 'docs/beta.md' && link.targetPath === 'alpha.md'), 'expected beta search result links');
assert(betaResult.linkedDocuments.some((doc) => doc.path === 'docs/gamma.md'), 'expected depth two linked document');
assert(betaResult.headings?.some((heading) => heading.title === 'Beta' && heading.line === 1), 'expected search result headings');

const relatedWithHeadings = spawnSync(process.execPath, [scriptPath, 'related', '--root', tmpRoot, '--path', 'alpha.md', '--limit', '5', '--include-headings'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (relatedWithHeadings.status !== 0) throw new Error(`source graph related headings failed:\n${relatedWithHeadings.stderr || relatedWithHeadings.stdout}`);
const relatedHeadingResults = JSON.parse(relatedWithHeadings.stdout);
assert(relatedHeadingResults.some((doc) => doc.path === 'docs/gamma.md' && doc.headings?.some((heading) => heading.title === 'Gamma')), 'expected related results to include headings');

const readmeSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'README', '--limit', '3'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (readmeSearch.status !== 0) throw new Error(`source graph README search failed:\n${readmeSearch.stderr || readmeSearch.stdout}`);
const readmeResults = JSON.parse(readmeSearch.stdout);
assert(readmeResults[0]?.path === 'README.md', 'expected root README to rank before nested skill README ties');

const fileModeBodyOnlySearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'Back', '--mode', 'file', '--limit', '3'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (fileModeBodyOnlySearch.status !== 0) throw new Error(`source graph file mode search failed:\n${fileModeBodyOnlySearch.stderr || fileModeBodyOnlySearch.stdout}`);
const fileModeBodyOnlyResults = JSON.parse(fileModeBodyOnlySearch.stdout);
assert(fileModeBodyOnlyResults.length === 0, 'expected CLI file mode search to skip body-only matches');

const defaultSkillSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'UniqueDuplicatedCopyToken', '--limit', '10'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (defaultSkillSearch.status !== 0) throw new Error(`source graph default skill search failed:\n${defaultSkillSearch.stderr || defaultSkillSearch.stdout}`);
const defaultSkillResults = JSON.parse(defaultSkillSearch.stdout);
assert(defaultSkillResults.length === 0, 'expected duplicate skill copies to be excluded by default');

const allSkillCopiesSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'UniqueDuplicatedCopyToken', '--limit', '10', '--include-copies'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (allSkillCopiesSearch.status !== 0) throw new Error(`source graph include-copies search failed:\n${allSkillCopiesSearch.stderr || allSkillCopiesSearch.stdout}`);
const allSkillCopiesResults = JSON.parse(allSkillCopiesSearch.stdout);
assert(allSkillCopiesResults.length === 3, 'expected include-copies to show all duplicate skill copies');

const dedupedLinkedSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'alpha', '--limit', '1', '--include-links'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (dedupedLinkedSearch.status !== 0) throw new Error(`source graph linked document dedupe search failed:\n${dedupedLinkedSearch.stderr || dedupedLinkedSearch.stdout}`);
const dedupedLinkedResults = JSON.parse(dedupedLinkedSearch.stdout);
const linkedSkillCopies = (dedupedLinkedResults[0]?.linkedDocuments || []).filter((doc) => /markdown-workspace-search\/references\/cli-commands\.md$/.test(doc.path));
assert(linkedSkillCopies.length === 0, 'expected linkedDocuments to exclude duplicate skill copies by default');
const linkedSkillEdges = (dedupedLinkedResults[0]?.links || []).filter((link) => /markdown-workspace-search\/references\/cli-commands\.md$/.test(link.sourcePath));
assert(linkedSkillEdges.length === 0, 'expected links to exclude duplicate skill-copy edges by default');

const allLinkedCopiesSearch = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'alpha', '--limit', '1', '--include-links', '--include-copies'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (allLinkedCopiesSearch.status !== 0) throw new Error(`source graph linked include-copies search failed:\n${allLinkedCopiesSearch.stderr || allLinkedCopiesSearch.stdout}`);
const allLinkedCopiesResults = JSON.parse(allLinkedCopiesSearch.stdout);
const allLinkedSkillCopies = (allLinkedCopiesResults[0]?.linkedDocuments || []).filter((doc) => /markdown-workspace-search\/references\/cli-commands\.md$/.test(doc.path));
assert(allLinkedSkillCopies.length === 3, 'expected include-copies to show all linked duplicate skill copies');
const allLinkedSkillEdges = (allLinkedCopiesResults[0]?.links || []).filter((link) => /markdown-workspace-search\/references\/cli-commands\.md$/.test(link.sourcePath));
assert(allLinkedSkillEdges.length === 3, 'expected include-copies to show all linked duplicate skill-copy edges');

const neighbors = spawnSync(process.execPath, [scriptPath, 'neighbors', '--root', tmpRoot, '--path', 'alpha.md'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (neighbors.status !== 0) throw new Error(`source graph neighbors failed:\n${neighbors.stderr || neighbors.stdout}`);
const neighborhood = JSON.parse(neighbors.stdout);
assert(neighborhood.documents.some((doc) => doc.path === 'docs/gamma.md'), 'expected gamma neighbor after partial link update');

await fs.rm(tmpRoot, { recursive: true, force: true });
console.log('source graph guard passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
