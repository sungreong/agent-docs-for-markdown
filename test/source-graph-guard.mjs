import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSourceGraphSqlite } from '../public/core/source-graph-sqlite.js';

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
await fs.mkdir(path.join(tmpRoot, 'docs'), { recursive: true });
await fs.writeFile(path.join(tmpRoot, 'docs', 'beta.md'), '# Beta\n\nBack to [[../alpha|Alpha]].\n', 'utf8');
await fs.writeFile(path.join(tmpRoot, 'docs', 'gamma.md'), '# Gamma\n\nLinked by basename.\n', 'utf8');

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
assert(db.tables.documents.length === 3, 'expected three indexed markdown documents');
assert(db.tables.links.some((link) => link.status === 'resolved' && link.targetPath === 'docs/beta.md'), 'expected resolved beta link');
assert(db.tables.links.some((link) => link.status === 'external'), 'expected external reference link');

await fs.writeFile(
  path.join(tmpRoot, 'alpha.md'),
  [
    '# Alpha',
    '',
    'See [[Gamma]] and [External][ext].',
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
assert(alphaLinks.some((link) => link.status === 'resolved-by-name' && link.targetPath === 'docs/gamma.md'), 'expected basename wiki link to resolve to gamma');
assert(!alphaLinks.some((link) => link.targetPath === 'docs/beta.md'), 'expected old beta link to be removed after update-file');

const search = spawnSync(process.execPath, [scriptPath, 'search', '--root', tmpRoot, '--query', 'beta', '--links-depth', '2'], {
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
