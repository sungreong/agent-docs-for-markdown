import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const sourceGraphScript = path.join(extensionRoot, 'scripts', 'source-graph.mjs');

const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-smoke-'));

try {
  await fs.writeFile(
    path.join(workspaceRoot, 'README.md'),
    '# Smoke Test\n\nSee [Guide](guide.md).\n\nalpha beta smoke\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(workspaceRoot, 'guide.md'),
    '# Guide\n\nBack to [Readme](README.md).\n',
    'utf8',
  );

  await runNode([sourceGraphScript, 'update', '--root', workspaceRoot]);
  const searchOutput = await runNode([
    sourceGraphScript,
    'search',
    '--root',
    workspaceRoot,
    '--query',
    'smoke',
    '--include-links',
    '--links-depth',
    '1',
  ]);
  const results = JSON.parse(searchOutput);
  assert(Array.isArray(results), 'Source Graph search should return an array');
  assert.equal(results[0]?.path, 'README.md', 'Source Graph search should find README.md');
  assert.equal(results[0]?.linkedDocuments?.[0]?.path, 'guide.md', 'Source Graph should include linked documents');
  assert.equal(results[0]?.links?.length, 2, 'Source Graph should include inbound and outbound links');
  console.log('source graph runtime smoke passed');
} finally {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, args, {
      cwd: extensionRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`node ${args.join(' ')} failed with ${code}\n${stderr || stdout}`));
    });
  });
}
