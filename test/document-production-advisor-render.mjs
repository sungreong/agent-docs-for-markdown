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
const inputPath = path.join(
  repoRoot,
  'ai_skills',
  'claude',
  'skills',
  'document-production-advisor',
  'examples',
  'request-fulfillment-render-test.md',
);
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-doc-advisor-'));
const standaloneOutputPath = path.join(tmpDir, 'request-fulfillment.standalone.html');
const blogOutputPath = path.join(tmpDir, 'request-fulfillment.blog.html');

await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  standaloneOutputPath,
  '--standalone',
  '--base-dir',
  path.dirname(inputPath),
]);

await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  blogOutputPath,
  '--export-target',
  'blog-embed',
  '--base-dir',
  path.dirname(inputPath),
]);

const standaloneHtml = await fs.readFile(standaloneOutputPath, 'utf8');
const blogHtml = await fs.readFile(blogOutputPath, 'utf8');

for (const html of [standaloneHtml, blogHtml]) {
  assert.match(html, /Request Fulfillment Render Test/);
  assert.match(html, /Request Contract/);
  assert.match(html, /Production Checks/);
  assert.match(html, /Before \/ After/);
  assert.match(html, /요청사항 충족 검증/);
  assert.match(html, /section-safe-zone/);
  assert.match(html, /section-problem-statement/);
  assert.match(html, /section-big-number-hero/);
  assert.match(html, /section-feature-grid/);
  assert.match(html, /section-contrast-pair/);
}

assert.match(standaloneHtml, /<!doctype html>/i);
assert.match(blogHtml.slice(0, 128), /<meta charset="UTF-8">/);
assert.match(blogHtml, /mps-embed-root mps-blog-embed/);

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('document production advisor render test passed');
