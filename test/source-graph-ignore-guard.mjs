import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSourceGraphSqlite } from '../public/core/source-graph-sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-ignore-'));
const scriptPath = path.join(repoRoot, 'scripts', 'source-graph.mjs');

try {
  await fs.mkdir(path.join(tmpRoot, 'keep'), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, 'ignored'), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, '.mpsignore'), ['ignored/**', '*.draft.md', '# comments are ignored', ''].join('\n'), 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'keep', 'visible.md'), '# Visible\n\n[Hidden](../ignored/hidden.md)\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'ignored', 'hidden.md'), '# Hidden\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, 'notes.draft.md'), '# Draft\n', 'utf8');

  run(['update', '--root', tmpRoot, '--json']);
  const dbPath = path.join(tmpRoot, '.mps', 'source-graph.sqlite');
  const db = await readSourceGraphSqlite(dbPath);
  const paths = db.tables.documents.map((doc) => doc.path).sort();
  assert(paths.length === 1 && paths[0] === 'keep/visible.md', `unexpected indexed paths: ${paths.join(', ')}`);
  assert(!db.tables.links.some((link) => link.targetDocumentId), 'ignored document should not become a resolved target');

  await fs.writeFile(path.join(tmpRoot, '.mpsignore'), '', 'utf8');
  run(['update', '--root', tmpRoot, '--json']);
  const unignored = await readSourceGraphSqlite(dbPath);
  assert(
    unignored.tables.documents.some((doc) => doc.path === 'ignored/hidden.md') &&
      unignored.tables.documents.some((doc) => doc.path === 'notes.draft.md'),
    'clearing .mpsignore should bring ignored markdown back into the graph',
  );
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

console.log('source graph ignore guard passed');

function run(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`source graph command failed: ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
