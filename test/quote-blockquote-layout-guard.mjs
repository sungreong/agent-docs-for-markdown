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
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-quote-layout-'));
const inputPath = path.join(tmpDir, 'quote-layout.md');
const outputPath = path.join(tmpDir, 'quote-layout.html');

const md = `---
title: Quote Layout Guard
theme: report
paginate: true
pageWidth: 1120px
pageHeight: 720px
---

## 짧은 원문 인용:

> "the spec is the key" — Addy Osmani

---
{: .page-break}

## 이 말의 의미:

좋은 질문보다 좋은 경계가 먼저다.
`;

await fs.writeFile(inputPath, md, 'utf8');
await execFileAsync('node', [
  path.join(repoRoot, 'scripts', 'md-to-html.mjs'),
  inputPath,
  '--out',
  outputPath,
  '--standalone',
  '--base-dir',
  tmpDir,
]);

const html = await fs.readFile(outputPath, 'utf8');
const css = await fs.readFile(path.join(repoRoot, 'public', 'document.css'), 'utf8');
const extensionCss = await fs.readFile(path.join(repoRoot, 'vscode-extension', 'public', 'document.css'), 'utf8');

assert(html.includes('document-shell is-paginated'), 'quote sample should render as paginated slide output');
assert(html.includes('class="md-blockquote'), 'quote sample should render a blockquote element');
for (const source of [css, extensionCss]) {
  assert.match(
    source,
    /\.document-shell\.is-paginated \.md-blockquote \{[\s\S]*?display: flex;[\s\S]*?justify-content: center;[\s\S]*?align-items: center;[\s\S]*?text-align: center;[\s\S]*?\}/,
    'paginated blockquotes should center quote content inside the quote card',
  );
  assert.match(
    source,
    /\.document-shell\.is-paginated \.md-blockquote \.md-paragraph \{[\s\S]*?margin-left: auto;[\s\S]*?margin-right: auto;[\s\S]*?text-align: center;[\s\S]*?\}/,
    'blockquote paragraphs should be centered without affecting ordinary body paragraphs',
  );
  assert.match(
    source,
    /\.document-shell\.is-paginated \.md-blockquote \{[\s\S]*?min-height: 0;[\s\S]*?padding: clamp\(0\.95rem, 2vw, 1\.35rem\) clamp\(1\.25rem, 3vw, 2\.25rem\);[\s\S]*?\}/,
    'ordinary paginated blockquotes should stay compact instead of reserving a large slide area',
  );
  assert.match(
    source,
    /\.template-quote-slide \.md-callout,[\s\S]*?\.template-quote-slide \.md-blockquote \{[\s\S]*?min-height: clamp\(7rem, 22vh, 11rem\);[\s\S]*?\}/,
    'quote-slide template should reserve only moderate vertical space for centered quotes',
  );
}

await fs.rm(tmpDir, { recursive: true, force: true });
console.log('quote blockquote layout guard ok');
