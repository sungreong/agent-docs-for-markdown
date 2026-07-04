import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-cli-'));

await fs.writeFile(path.join(tmpRoot, 'index.md'), '# Index\n\n- [Guide](guide.md)\n- [Reference](reference.md)\n', 'utf8');
await fs.writeFile(path.join(tmpRoot, 'guide.md'), '# Guide\n\nRelated to [[reference]].\n', 'utf8');
await fs.writeFile(path.join(tmpRoot, 'reference.md'), '# Reference\n\nBack to [Index](index.md).\n', 'utf8');
await fs.mkdir(path.join(tmpRoot, '.codex', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
await fs.mkdir(path.join(tmpRoot, '.agents', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
await fs.mkdir(path.join(tmpRoot, 'ai_skills', 'shared', 'skills', 'markdown-workspace-search', 'references'), { recursive: true });
const copiedSkillReference = '# Source Graph CLI Commands\n\nUnique CLI duplicate marker.\n';
await fs.writeFile(path.join(tmpRoot, '.codex', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');
await fs.writeFile(path.join(tmpRoot, '.agents', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');
await fs.writeFile(path.join(tmpRoot, 'ai_skills', 'shared', 'skills', 'markdown-workspace-search', 'references', 'cli-commands.md'), copiedSkillReference, 'utf8');

const scriptPath = path.join(repoRoot, 'scripts', 'source-graph.mjs');

try {
  const update = runCli(['update', '--root', tmpRoot, '--json']);
  const updateJson = JSON.parse(update.stdout);
  assert(updateJson.documents === 6, 'expected update summary to include indexed documents');

  const defaultSkillSearch = JSON.parse(runCli(['search', '--root', tmpRoot, '--query', 'Unique CLI duplicate marker', '--limit', '10']).stdout);
  assert(defaultSkillSearch.length === 0, 'expected CLI search to exclude duplicate skill copies by default');

  const allSkillCopiesSearch = JSON.parse(runCli(['search', '--root', tmpRoot, '--query', 'Unique CLI duplicate marker', '--limit', '10', '--include-copies']).stdout);
  assert(allSkillCopiesSearch.length === 3, 'expected CLI include-copies search to expose duplicate skill copies');

  const compactSearch = JSON.parse(runCli(['search', '--root', tmpRoot, '--query', 'guide', '--limit', '2', '--compact', '--heading-limit', '5']).stdout);
  assert(compactSearch[0]?.path === 'guide.md', 'expected compact search to return the best Markdown document');
  assert(!compactSearch[0]?.id, 'expected compact workspace search to omit bulky document metadata');

  const outputPath = path.join('.mps', 'cli-search-output.json');
  const outputMeta = JSON.parse(runCli(['search', '--root', tmpRoot, '--query', 'guide', '--limit', '2', '--compact', '--output', outputPath]).stdout);
  assert(outputMeta.outputPath.endsWith('cli-search-output.json'), 'expected CLI --output to print saved output metadata');
  await fs.access(path.join(tmpRoot, outputPath));

  await fs.writeFile(path.join(tmpRoot, 'guide.md'), '# Guide\n\nRelated to [[reference]].\n\nNew code:\n\n```js\nconsole.log("changed");\n```\n', 'utf8');

  const searchResult = JSON.parse(runCli(['search', '--root', tmpRoot, '--query', 'guide', '--limit', '1', '--include-links', '--links-depth', '2', '--include-headings']).stdout);
  assert(searchResult[0]?.linksDepth === 2, 'expected CLI search links depth in result');
  assert(searchResult[0]?.headings?.some((heading) => heading.title === 'Guide'), 'expected CLI search headings in result');
  assert(Array.isArray(searchResult[0]?.links), 'expected CLI search links in result');
  assert(searchResult[0].links.some((link) => link.sourcePath === 'guide.md' && link.targetPath === 'reference.md'), 'expected guide search links');

  const relatedResults = JSON.parse(runCli(['related', '--root', tmpRoot, '--path', 'guide.md', '--limit', '5', '--include-headings']).stdout);
  assert(relatedResults.some((doc) => doc.path === 'reference.md' && doc.headings?.some((heading) => heading.title === 'Reference')), 'expected related headings in CLI result');
  assert(relatedResults.some((doc) => doc.path === 'index.md'), 'expected backlink or shared related document');

  const neighbors = JSON.parse(runCli(['neighbors', '--root', tmpRoot, '--path', 'guide.md']).stdout);
  assert(neighbors.documents.some((doc) => doc.path === 'reference.md'), 'expected neighbors to include linked reference');
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

console.log('source graph CLI skill guard passed');

function runCli(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`source graph CLI failed for ${args.join(' ')}:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
