#!/usr/bin/env node
import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const cssPath of ['public/document.css', 'vscode-extension/public/document.css']) {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert(
    css.includes('.document-shell:not(.is-paginated) .md-section > .md-section'),
    `${cssPath} should visually flatten nested web-mode sections`,
  );
  assert(
    /\.studio-document code\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/m.test(css),
    `${cssPath} should wrap long inline code tokens`,
  );
  assert(
    /\.document-intro,\s*[\r\n]+\.md-toc,\s*[\r\n]+\.md-section\s*\{[\s\S]*min-width:\s*0;/m.test(css),
    `${cssPath} should let section cards shrink inside constrained layouts`,
  );
}

console.log('nested-heading-layout-guard ok');
