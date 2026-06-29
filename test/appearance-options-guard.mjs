import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-appearance-'));

async function runCli(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(repoRoot, 'scripts', 'md-to-html.mjs'), ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
  return { stdout, stderr };
}

const inputPath = path.join(tmpRoot, 'appearance.md');
const optionOutPath = path.join(tmpRoot, 'appearance-option.html');
const defaultOutPath = path.join(tmpRoot, 'appearance-default.html');

await fs.writeFile(
  inputPath,
  `---
title: Appearance Guard
theme: report
---

# Appearance Guard

This document checks viewer appearance options.
`,
  'utf8',
);

await runCli([
  inputPath,
  '--out',
  optionOutPath,
  '--appearance',
  'flat',
  '--appearance-font',
  'aptos',
  '--appearance-radius',
  'none',
  '--appearance-background',
  'plain',
  '--viewer-chrome',
  'hidden',
  '--standalone',
]);

const optionHtml = await fs.readFile(optionOutPath, 'utf8');
assert.match(optionHtml, /<body[^>]*class="[^"]*appearance-flat[^"]*appearance-bg-plain[^"]*appearance-font-aptos[^"]*appearance-radius-none[^"]*viewer-chrome-hidden/);
assert.match(optionHtml, /class="studio-document[^"]*appearance-flat[^"]*appearance-bg-plain[^"]*appearance-font-aptos[^"]*appearance-radius-none/);
assert.match(optionHtml, /data-appearance="flat"/);
assert.match(optionHtml, /data-appearance-font="aptos"/);
assert.match(optionHtml, /data-viewer-chrome="hidden"/);
assert.match(optionHtml, /data-export-style-menu/);
assert.match(optionHtml, /data-action="zoom-fill"/);
assert.match(optionHtml, /Fill Width/);
assert.match(optionHtml, /<option value="ink">Ink<\/option>/);
assert.match(optionHtml, /<option value="graphite">Graphite<\/option>/);
assert.match(optionHtml, /<option value="aptos" selected>Aptos<\/option>/);
assert.match(optionHtml, /<option value="noto-kr">Noto Sans KR<\/option>/);
assert.match(optionHtml, /\.studio-document\.appearance-bg-transparent\s*\{[\s\S]*--doc-text: #172033;/);
assert.match(optionHtml, /\.studio-document\.appearance-bg-ink\s*\{[\s\S]*--doc-bg: #101722;/);
assert.match(optionHtml, /\.studio-document\.appearance-bg-graphite\s*\{[\s\S]*--doc-bg: #171a20;/);
assert.match(optionHtml, /\.studio-document\.appearance-font-aptos\s*\{[\s\S]*--font-body: "Aptos"/);
assert.match(optionHtml, /body\.export-slides\.appearance-bg-ink\s*\{[\s\S]*background: #080c12;/);

const appCss = await fs.readFile(path.join(repoRoot, 'public', 'styles.css'), 'utf8');
assert.match(appCss, /\.preview-root:has\(\.studio-document\.appearance-bg-transparent\)/);
assert.match(appCss, /\.preview-root:has\(\.studio-document\.appearance-bg-navy\)/);

const appJs = await fs.readFile(path.join(repoRoot, 'public', 'app.js'), 'utf8');
const documentCss = await fs.readFile(path.join(repoRoot, 'public', 'document.css'), 'utf8');
assert.match(appJs, /\{ value: 'conference', label: 'conference' \}/);
assert.match(documentCss, /\.studio-document\.theme-conference\s*\{[\s\S]*--doc-bg: #0d1321;/);

const appearanceSource = await fs.readFile(path.join(repoRoot, 'public', 'core', 'appearance.js'), 'utf8');
const readOptionBlock = (name) => appearanceSource.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`))?.[1] || '';
const backgroundOptionCount = (readOptionBlock('APPEARANCE_BACKGROUND_OPTIONS').match(/\{ value: '[^']+', label: '[^']+' \}/g) || []).length;
const fontOptionCount = (readOptionBlock('APPEARANCE_FONT_OPTIONS').match(/\{ value: '[^']+', label: '[^']+' \}/g) || []).length;
assert(backgroundOptionCount >= 17, `expected at least 17 background options, got ${backgroundOptionCount}`);
assert(fontOptionCount >= 16, `expected at least 16 font options, got ${fontOptionCount}`);

await runCli([inputPath, '--out', defaultOutPath, '--no-standalone']);
const defaultHtml = await fs.readFile(defaultOutPath, 'utf8');
const rootClass = defaultHtml.match(/class="studio-document([^"]*)"/)?.[1] || '';
assert.equal(/appearance-|viewer-chrome-/.test(rootClass), false);

await fs.rm(tmpRoot, { recursive: true, force: true });
