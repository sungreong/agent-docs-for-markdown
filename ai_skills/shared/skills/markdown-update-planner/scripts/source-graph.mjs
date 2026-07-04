#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const selfPath = path.resolve(fileURLToPath(import.meta.url));
const runtime = {
  platform: process.platform,
  pathSeparator: path.sep,
  shellHint: process.platform === 'win32' ? 'powershell' : 'posix-shell',
};
const markdownExtensions = new Set(['.md', '.mdx', '.markdown', '.mdown', '.mkd', '.mkdn']);
const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'out', '.mps']);
const skillCopyDirs = new Set(['.codex', '.agents', '.claude', '.gemini', '.cursor', 'ai_skills']);

const workspaceCli = findWorkspaceCli(path.dirname(selfPath)) || findWorkspaceCli(process.cwd());
if (workspaceCli) {
  const result = spawnSync(process.execPath, [workspaceCli, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

await runPortableSourceGraph(process.argv.slice(2));

function findWorkspaceCli(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'scripts', 'source-graph.mjs');
    if (candidate !== selfPath && fsSync.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function runPortableSourceGraph(argv) {
  const command = argv[0] || 'help';
  const args = parseArgs(argv.slice(1));
  const root = path.resolve(String(args.root || process.cwd()));

  if (command === 'help' || args.help) {
    printHelp();
    return;
  }

  const graph = await buildPortableGraph(root, { includeCopies: Boolean(args.includeCopies || args['include-copies']) });

  if (command === 'update') {
    const outPath = await writePortableGraph(root, graph);
    if (args.json) {
      writeJson(summarizeGraph(root, graph, { mode: 'portable-fallback', indexPath: outPath }));
    } else {
      console.error(`Workspace scripts/source-graph.mjs was not found; using portable Markdown graph fallback (${runtime.platform}).`);
      console.log(`Portable source graph updated: ${outPath}`);
    }
    return;
  }

  if (command === 'audit') {
    await writeJson(buildAudit(root, graph, args), args);
    return;
  }

  if (command === 'search') {
    const query = String(args.query || args._[0] || '');
    await writeJson(searchGraph(graph, query, args), args);
    return;
  }

  if (command === 'related') {
    await writeJson(relatedGraph(graph, args), args);
    return;
  }

  if (command === 'neighbors') {
    await writeJson(neighborsGraph(graph, String(args.path || args.id || args._[0] || '')), args);
    return;
  }

  console.error(`Unknown portable source graph command: ${command}`);
  printHelp();
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function buildPortableGraph(root, options = {}) {
  const files = await collectMarkdownFiles(root, options);
  const documents = [];
  const byPath = new Map();

  for (const filePath of files) {
    const text = await fs.readFile(path.join(root, filePath), 'utf8');
    const stat = await fs.stat(path.join(root, filePath));
    const headings = extractHeadings(text);
    const doc = {
      id: `doc:${filePath.replace(/[^a-zA-Z0-9]+/g, ':')}`,
      path: filePath,
      title: headings[0]?.title || path.basename(filePath),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      lineCount: text.split(/\r?\n/).length,
      wordCount: (text.match(/\S+/g) || []).length,
      headingCount: headings.length,
      headings,
      text,
      snippet: compact(text).slice(0, 320),
      links: [],
      incomingCount: 0,
      outgoingCount: 0,
    };
    documents.push(doc);
    byPath.set(filePath.toLowerCase(), doc);
  }

  const links = [];
  for (const doc of documents) {
    doc.links = extractLinks(doc.text, doc.path, byPath);
    doc.outgoingCount = doc.links.filter((link) => link.status === 'resolved').length;
    links.push(...doc.links);
  }

  for (const link of links) {
    if (link.status !== 'resolved') continue;
    const target = byPath.get(link.targetPath.toLowerCase());
    if (target) target.incomingCount += 1;
  }

  return { root, updatedAt: new Date().toISOString(), documents, links };
}

async function collectMarkdownFiles(root, options = {}) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) continue;
        const relDir = toPosix(path.relative(root, path.join(dir, entry.name)));
        if (!options.includeCopies && isSkillCopyDir(entry.name, relDir)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile() || !markdownExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      results.push(toPosix(path.relative(root, path.join(dir, entry.name))));
    }
  }
  await walk(root);
  return results.sort();
}

function isSkillCopyDir(name, relDir) {
  if (skillCopyDirs.has(name) && !relDir.includes('/')) return true;
  return /^vscode-extension\/ai_skills(?:\/|$)/.test(relDir);
}

function extractHeadings(text) {
  const headings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.replace(/^\uFEFF/, ''));
    if (!match) return;
    const title = match[2].trim();
    headings.push({
      title,
      depth: match[1].length,
      line: index + 1,
      slug: title.toLowerCase().replace(/[^a-z0-9가-힣]+/gi, '-').replace(/^-|-$/g, ''),
    });
  });
  return headings;
}

function extractLinks(text, sourcePath, byPath) {
  const links = [];
  const lines = text.split(/\r?\n/);
  const sourceDir = path.posix.dirname(sourcePath);

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/!?\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push(resolveLink(sourcePath, sourceDir, match[2], match[1], index + 1, byPath));
    }
    for (const match of line.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
      const [target, label] = match[1].split('|').map((part) => part.trim());
      links.push(resolveLink(sourcePath, sourceDir, target, label || target, index + 1, byPath));
    }
    for (const match of line.matchAll(/\bhttps?:\/\/[^\s)>\]]+/g)) {
      links.push({
        sourcePath,
        targetPath: match[0],
        href: match[0],
        label: match[0],
        line: index + 1,
        status: 'external',
      });
    }
  });

  return links;
}

function resolveLink(sourcePath, sourceDir, rawHref, label, line, byPath) {
  const href = rawHref.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return { sourcePath, targetPath: href, href, label, line, status: 'external' };
  }
  const withoutAnchor = decodeURIComponent(href.split('#')[0] || '');
  if (!withoutAnchor) {
    return { sourcePath, targetPath: sourcePath, href, label, line, status: 'self-anchor' };
  }
  const normalized = toPosix(path.posix.normalize(path.posix.join(sourceDir, withoutAnchor)));
  const candidates = [
    normalized,
    `${normalized}.md`,
    `${normalized}.mdx`,
    toPosix(path.posix.join(normalized, 'README.md')),
  ];
  const target = candidates.find((candidate) => byPath.has(candidate.toLowerCase()));
  return {
    sourcePath,
    targetPath: target || withoutAnchor,
    href,
    label,
    line,
    status: target ? 'resolved' : 'unresolved',
  };
}

async function writePortableGraph(root, graph) {
  const dir = path.join(root, '.mps');
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, 'source-graph-portable.json');
  const serializable = {
    ...graph,
    documents: graph.documents.map(({ text, ...doc }) => doc),
  };
  await fs.writeFile(outPath, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  return outPath;
}

function searchGraph(graph, query, args = {}) {
  const limit = numberArg(args.limit, 10, 1, 100);
  const terms = tokenize(query);
  const includeLinks = args.includeLinks || args['include-links'];
  const includeHeadings = args.includeHeadings || args['include-headings'];
  const headingLimit = numberArg(args.headingLimit ?? args['heading-limit'], 8, 1, 50);
  const compact = Boolean(args.compact || args.summary);
  return graph.documents
    .map((doc) => ({ doc, score: scoreDocument(doc, terms, query) }))
    .filter((item) => item.score > 0 || !query)
    .sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path))
    .slice(0, limit)
    .map(({ doc, score }) => formatDocument(graph, doc, { includeLinks, includeHeadings, headingLimit, compact, score }));
}

function relatedGraph(graph, args = {}) {
  const limit = numberArg(args.limit, 8, 1, 100);
  const seed = findSeed(graph, args);
  if (!seed) return [];
  const headingLimit = numberArg(args.headingLimit ?? args['heading-limit'], 8, 1, 50);
  const compact = Boolean(args.compact || args.summary);
  const seedTerms = new Set(tokenize(`${seed.title} ${seed.text}`));
  const linked = new Set(seed.links.filter((link) => link.status === 'resolved').map((link) => link.targetPath));
  const inbound = new Set(graph.links.filter((link) => link.status === 'resolved' && link.targetPath === seed.path).map((link) => link.sourcePath));

  return graph.documents
    .filter((doc) => doc.path !== seed.path)
    .map((doc) => {
      const terms = tokenize(`${doc.title} ${doc.text}`);
      const shared = terms.filter((term) => seedTerms.has(term)).length;
      const linkScore = linked.has(doc.path) || inbound.has(doc.path) ? 20 : 0;
      return { doc, score: linkScore + shared };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.path.localeCompare(b.doc.path))
    .slice(0, limit)
    .map(({ doc, score }) => formatDocument(graph, doc, {
      includeHeadings: args.includeHeadings || args['include-headings'],
      headingLimit,
      compact,
      score,
    }));
}

function neighborsGraph(graph, seedPath) {
  const seed = graph.documents.find((doc) => doc.path.toLowerCase() === toPosix(seedPath).toLowerCase());
  if (!seed) return { path: seedPath, documents: [], links: [] };
  const outbound = seed.links.filter((link) => link.status === 'resolved');
  const inbound = graph.links.filter((link) => link.status === 'resolved' && link.targetPath === seed.path);
  const paths = new Set([...outbound.map((link) => link.targetPath), ...inbound.map((link) => link.sourcePath)]);
  return {
    path: seed.path,
    documents: graph.documents.filter((doc) => paths.has(doc.path)).map((doc) => formatDocument(graph, doc, {})),
    links: [...outbound, ...inbound],
  };
}

function buildAudit(root, graph, args = {}) {
  const unresolved = graph.links.filter((link) => link.status === 'unresolved');
  const orphans = graph.documents.filter((doc) => doc.incomingCount === 0 && doc.outgoingCount === 0);
  return {
    root,
    updatedAt: graph.updatedAt,
    runtime,
    mode: args.summaryOnly || args['summary-only'] ? 'summary-only-portable-fallback' : 'portable-fallback',
    summary: {
      indexedDocuments: graph.documents.length,
      headings: graph.documents.reduce((sum, doc) => sum + doc.headingCount, 0),
      links: graph.links.length,
      unresolvedInternalLinks: unresolved.length,
      orphanDocuments: orphans.length,
      graphNodes: graph.documents.length,
      graphEdges: graph.links.filter((link) => link.status === 'resolved').length,
    },
    graph: {
      orphanDocuments: orphans.slice(0, 20).map((doc) => formatDocument(graph, doc, {})),
      unresolvedInternalLinks: unresolved.slice(0, 50),
    },
    notes: [
      'Portable fallback is active because workspace scripts/source-graph.mjs was not found.',
      `Runtime detected: ${runtime.platform} (${runtime.shellHint}).`,
      'Portable fallback excludes local agent skill copies by default; pass --include-copies when auditing installed skills.',
      'Install Markdown Pattern Studio Source Graph CLI for SQLite-backed ranking, duplicate-copy collapse, and richer audits.',
    ],
  };
}

function findSeed(graph, args = {}) {
  const seedPath = String(args.path || args.id || '');
  if (seedPath) {
    const normalized = toPosix(seedPath).toLowerCase();
    const found = graph.documents.find((doc) => doc.path.toLowerCase() === normalized);
    if (found) return found;
  }
  const query = String(args.query || args._?.[0] || '');
  return searchGraph(graph, query, { limit: 1 })[0]?._doc || graph.documents.find((doc) => doc.path === query);
}

function formatDocument(graph, doc, options = {}) {
  if (options.compact) {
    const compactResult = {
      path: doc.path,
      title: doc.title,
      score: options.score,
      headingCount: doc.headingCount,
      outgoingCount: doc.outgoingCount,
      incomingCount: doc.incomingCount,
      snippet: doc.snippet,
    };
    if (options.includeHeadings) {
      compactResult.headings = doc.headings
        .slice(0, numberArg(options.headingLimit, 8, 1, 50))
        .map((heading) => ({ title: heading.title, line: heading.line }));
    }
    if (options.includeLinks) {
      compactResult.links = doc.links.slice(0, numberArg(options.linkLimit, 10, 1, 50)).map((link) => ({
        targetPath: link.targetPath,
        label: link.label,
        line: link.line,
        status: link.status,
      }));
    }
    Object.defineProperty(compactResult, '_doc', { value: doc, enumerable: false });
    return compactResult;
  }

  const result = {
    id: doc.id,
    path: doc.path,
    title: doc.title,
    mtimeMs: doc.mtimeMs,
    size: doc.size,
    lineCount: doc.lineCount,
    wordCount: doc.wordCount,
    headingCount: doc.headingCount,
    outgoingCount: doc.outgoingCount,
    incomingCount: doc.incomingCount,
    snippet: doc.snippet,
  };
  if (options.score !== undefined) result.score = options.score;
  if (options.includeHeadings) result.headings = doc.headings.slice(0, numberArg(options.headingLimit, 8, 1, 50));
  if (options.includeLinks) {
    const linkPaths = new Set(doc.links.filter((link) => link.status === 'resolved').map((link) => link.targetPath));
    result.links = doc.links;
    result.linkedDocuments = graph.documents.filter((item) => linkPaths.has(item.path)).map((item) => formatDocument(graph, item, {}));
  }
  Object.defineProperty(result, '_doc', { value: doc, enumerable: false });
  return result;
}

function numberArg(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function scoreDocument(doc, terms, query) {
  if (!query) return 1;
  const haystack = `${doc.path}\n${doc.title}\n${doc.text}`.toLowerCase();
  const exact = haystack.includes(query.toLowerCase()) ? 10 : 0;
  return exact + terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 1);
}

function summarizeGraph(root, graph, extra = {}) {
  return {
    root,
    updatedAt: graph.updatedAt,
    runtime,
    ...extra,
    summary: {
      indexedDocuments: graph.documents.length,
      headings: graph.documents.reduce((sum, doc) => sum + doc.headingCount, 0),
      links: graph.links.length,
      unresolvedInternalLinks: graph.links.filter((link) => link.status === 'unresolved').length,
      graphEdges: graph.links.filter((link) => link.status === 'resolved').length,
    },
    notes: [
      'Portable fallback excludes local agent skill copies by default; pass --include-copies when auditing installed skills.',
    ],
  };
}

function compact(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

async function writeJson(value, args = {}) {
  if (args.output) {
    const outputPath = path.resolve(String(args.output));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, bytes: fsSync.statSync(outputPath).size }, null, 2));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`Portable Markdown Source Graph

Usage:
  node scripts/source-graph.mjs update --root .
  node scripts/source-graph.mjs search --root . --query "topic" --include-links --include-headings
  node scripts/source-graph.mjs search --root . --query "topic" --compact --heading-limit 5
  node scripts/source-graph.mjs search --root . --query "topic" --output .mps/search-results.json
  node scripts/source-graph.mjs related --root . --path README.md --include-headings
  node scripts/source-graph.mjs neighbors --root . --path README.md
  node scripts/source-graph.mjs audit --root .

This skill script first delegates to a workspace scripts/source-graph.mjs when available.
If it is missing, it scans Markdown files directly with a portable fallback.`);
}
