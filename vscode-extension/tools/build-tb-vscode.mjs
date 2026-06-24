import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extRoot, '..');

const css = fs.readFileSync(path.join(repoRoot, 'public/document.css'), 'utf-8');
// Escape for JS template literal
const cssEsc = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const srcHtml = fs.readFileSync(path.join(repoRoot, 'public/template-builder.html'), 'utf-8');

// Replace placeholder with inlined CSS
const outHtml = srcHtml.replace('DOCUMENT_CSS_PLACEHOLDER', cssEsc);

const outPath = path.join(extRoot, 'public/template-builder.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, outHtml, 'utf-8');
console.log(`[build-tb] Written ${outPath} (${outHtml.length} bytes)`);
