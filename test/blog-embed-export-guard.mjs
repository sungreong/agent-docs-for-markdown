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
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-blog-embed-'));
const inputPath = path.join(tmpDir, 'deck.md');
const blogOutputPath = path.join(tmpDir, 'deck.blog.html');
const fragmentOutputPath = path.join(tmpDir, 'deck.fragment.html');

await fs.writeFile(
  inputPath,
  `---
title: Blog Embed Guard
theme: report
---

# Cover {#cover .cover}

Intro text for the first page.

---
{: .page-break}

## Two Columns {: .two-column}

### Left

- Alpha
- Beta

### Right

\`\`\`js
console.log('copy me');
\`\`\`
`,
  'utf8',
);

await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  blogOutputPath,
  '--export-target',
  'blog-embed',
]);

await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  fragmentOutputPath,
  '--export-target',
  'fragment',
]);

const blogHtml = await fs.readFile(blogOutputPath, 'utf8');
const fragmentHtml = await fs.readFile(fragmentOutputPath, 'utf8');

assert.match(blogHtml, /data-md-studio-export-target="blog-embed"/);
assert.match(blogHtml.slice(0, 128), /<meta charset="UTF-8">/);
assert.match(blogHtml, /mps-embed-root mps-blog-embed/);
assert.match(blogHtml, /\.mps-embed-root \.studio-document/);
assert.match(blogHtml, /\.mps-embed-root\.mps-blog-embed \.document-shell\.is-paginated \.doc-page/);
assert.match(blogHtml, /\.mps-embed-root\.mps-blog-embed \.document-shell\.is-paginated \.section-heading\.level-1/);
assert.match(blogHtml, /padding:\s*clamp\(1\.25rem,\s*6vw,\s*2rem\)\s*!important/);
assert.match(blogHtml, /container: mps-embed \/ inline-size/);
assert.match(blogHtml, /data-copy-code/);
assert.doesNotMatch(blogHtml, /<!doctype html>/i);
assert.doesNotMatch(blogHtml, /<body/i);
assert.doesNotMatch(blogHtml, /\.export-slide-nav\s*\{/);
assert.doesNotMatch(blogHtml, /\.export-outline\s*\{/);
assert.doesNotMatch(blogHtml, /position:\s*fixed/i);
assert.doesNotMatch(blogHtml, /position\s*=\s*['"]fixed['"]/i);

assert.match(fragmentHtml, /data-md-studio-export-target="fragment"/);
assert.match(fragmentHtml.slice(0, 128), /<meta charset="UTF-8">/);
assert.match(fragmentHtml, /mps-embed-root mps-content-fragment/);
assert.doesNotMatch(fragmentHtml, /<script>/i);
assert.doesNotMatch(fragmentHtml, /position:\s*fixed/i);

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('blog embed export guard passed');
