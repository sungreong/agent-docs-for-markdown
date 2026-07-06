import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSourceGraphSqlite } from '../public/core/source-graph-sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const fixtureRoot = path.join(repoRoot, 'test', 'source-graph-fixture');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-linked-docs-'));

await fs.cp(fixtureRoot, tmpRoot, { recursive: true });
await fs.writeFile(path.join(tmpRoot, '.gitignore'), 'processed/*\n', 'utf8');
await fs.mkdir(path.join(tmpRoot, 'processed'), { recursive: true });
await fs.writeFile(
  path.join(tmpRoot, 'processed', 'gitignored-report.md'),
  ['# Gitignored Report', '', 'Source Graph should index this because .mpsignore is the graph ignore contract.', ''].join('\n'),
  'utf8',
);

const scriptPath = path.join(repoRoot, 'scripts', 'source-graph.mjs');
run(['update', '--root', tmpRoot, '--json']);

let db = await readDb();
findDocument(db, 'processed/gitignored-report.md');
assertResolved(db, 'index.md', 'alpha.md');
assertResolved(db, 'index.md', 'beta.md');
assertResolved(db, 'index.md', 'gamma.md');
assertResolved(db, 'alpha.md', 'beta.md');
assertResolved(db, 'beta.md', 'gamma.md');
assertResolved(db, 'gamma.md', 'alpha.md');

await fs.writeFile(
  path.join(tmpRoot, 'beta.md'),
  ['# Beta Fixture', '', 'Beta now points to [Alpha](alpha.md) instead of Gamma.', ''].join('\n'),
  'utf8',
);
run(['update-file', '--root', tmpRoot, '--path', 'beta.md', '--json']);

db = await readDb();
assertResolved(db, 'beta.md', 'alpha.md');
assertNotTarget(db, 'beta.md', 'gamma.md');
const betaDocument = findDocument(db, 'beta.md');
assert(betaDocument.title === 'Beta Fixture', 'expected update-file to refresh changed document title in SQLite');
assert(
  betaDocument.snippet.includes('Beta now points to'),
  'expected update-file to refresh changed document snippet in SQLite',
);

await fs.writeFile(
  path.join(tmpRoot, 'alpha.md'),
  ['# Alpha Fixture', '', 'Alpha now points by basename to [[Gamma]].', ''].join('\n'),
  'utf8',
);
run(['update-file', '--root', tmpRoot, '--path', 'alpha.md', '--json']);

db = await readDb();
assertResolved(db, 'alpha.md', 'gamma.md');
assertNotTarget(db, 'alpha.md', 'beta.md');

await fs.writeFile(
  path.join(tmpRoot, 'delta.md'),
  ['# Delta Fixture', '', 'Delta is a newly added document that links to [Alpha](alpha.md).', ''].join('\n'),
  'utf8',
);
run(['update-file', '--root', tmpRoot, '--path', 'delta.md', '--json']);

db = await readDb();
const deltaDocument = findDocument(db, 'delta.md');
assert(deltaDocument.title === 'Delta Fixture', 'expected update-file to add newly created Markdown documents');
assertResolved(db, 'delta.md', 'alpha.md');

await fs.rm(tmpRoot, { recursive: true, force: true });
console.log('source graph linked docs update guard passed');

function run(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`source graph command failed: ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
}

async function readDb() {
  return readSourceGraphSqlite(path.join(tmpRoot, '.mps', 'source-graph.sqlite'));
}

function assertResolved(db, sourcePath, targetPath) {
  const link = findLink(db, sourcePath, targetPath);
  if (!link) throw new Error(`Expected ${sourcePath} -> ${targetPath}`);
  if (!String(link.status || '').startsWith('resolved')) {
    throw new Error(`Expected resolved link ${sourcePath} -> ${targetPath}, got ${link.status}`);
  }
}

function assertNotTarget(db, sourcePath, targetPath) {
  const link = findLink(db, sourcePath, targetPath);
  if (link) throw new Error(`Expected old link to be removed: ${sourcePath} -> ${targetPath}`);
}

function findLink(db, sourcePath, targetPath) {
  return (db.tables.links || []).find((link) => link.sourcePath === sourcePath && link.targetPath === targetPath);
}

function findDocument(db, documentPath) {
  const document = (db.tables.documents || []).find((doc) => doc.path === documentPath);
  if (!document) throw new Error(`Expected document row for ${documentPath}`);
  return document;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
