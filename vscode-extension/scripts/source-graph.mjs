#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildSourceGraphIndex,
  getSourceGraphNeighbors,
  searchSourceGraph,
  updateSourceGraphDocuments,
} from '../public/core/source-graph.js';
import {
  readSourceGraphSqlite,
  writeSourceGraphSqlite,
} from '../public/core/source-graph-sqlite.js';
import { MPS_IGNORE_FILE, createIgnoreMatcher, parseIgnoreRules } from '../public/core/ignore-rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_DB_REL = '.mps/source-graph.sqlite';
const LEGACY_JSON_DB_REL = '.mps/source-graph.json';
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.mdown', '.mkd', '.mkdn']);
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', 'out', 'coverage']);
const DEFAULT_IGNORE_PATTERNS = ['.mps/**'];

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const args = parseArgs(argv.slice(1));
  if (command === 'update') {
    const db = await updateGraph(args);
    if (args.json) process.stdout.write(`${JSON.stringify(summarizeDb(db), null, 2)}\n`);
    else process.stdout.write(`Source graph updated: ${resolveDbPath(args)}\n`);
    return;
  }
  if (command === 'update-file') {
    const db = await updateGraphFiles(args);
    if (args.json) process.stdout.write(`${JSON.stringify(summarizeDb(db), null, 2)}\n`);
    else process.stdout.write(`Source graph file update applied: ${resolveDbPath(args)}\n`);
    return;
  }
  if (command === 'search') {
    const db = await loadOrUpdateGraph(args);
    const results = enrichSearchResultsWithLinks(
      db,
      searchSourceGraph(db, String(args.query || args._[0] || ''), Number(args.limit || 20)),
      args,
    );
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }
  if (command === 'neighbors') {
    const db = await loadOrUpdateGraph(args);
    const result = getSourceGraphNeighbors(db, String(args.path || args.id || args._[0] || ''), Number(args.depth || 1));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'related') {
    const db = await loadOrUpdateGraph(args);
    const result = findRelatedDocuments(db, args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'mcp') {
    await runMcpServer(args);
    return;
  }
  printHelp();
}

async function updateGraph(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const include = String(args.include || '').trim();
  const documents = await collectMarkdownDocuments(root, include);
  const db = buildSourceGraphIndex(documents, { root, updatedAt: new Date().toISOString(), includeExternal: true });
  const dbPath = resolveDbPath(args, root);
  await writeSourceGraphSqlite(dbPath, db);
  return db;
}

async function loadOrUpdateGraph(args = {}) {
  const dbPath = resolveDbPath(args);
  if (args.update) return updateGraph(args);
  try {
    const db = await readGraphDb(args);
    if (args.noAutoUpdate !== true && args['no-auto-update'] !== true) {
      const changes = await getGraphDbChangeSet(db, args);
      if (changes.full) return updateGraph(args);
      if (changes.changedPaths.length) return updateGraphFiles({ ...args, path: changes.changedPaths });
    }
    return db;
  } catch {
    return updateGraph(args);
  }
}

async function isGraphDbStale(db, args = {}) {
  const changes = await getGraphDbChangeSet(db, args);
  return changes.full || changes.changedPaths.length > 0;
}

async function getGraphDbChangeSet(db, args = {}) {
  const root = path.resolve(String(args.root || db.root || process.cwd()));
  const include = String(args.include || '').trim();
  const stats = await collectMarkdownStats(root, include);
  const indexed = db?.tables?.documents || [];
  if (stats.length !== indexed.length) return { full: true, changedPaths: [] };
  const indexedByPath = new Map(indexed.map((doc) => [String(doc.path || '').toLowerCase(), Number(doc.mtimeMs || 0)]));
  const statByPath = new Map(stats.map((item) => [item.path.toLowerCase(), item.mtimeMs]));
  if (indexed.some((doc) => !statByPath.has(String(doc.path || '').toLowerCase()))) {
    return { full: true, changedPaths: [] };
  }
  const changedPaths = stats
    .filter((item) => Math.abs((indexedByPath.get(item.path.toLowerCase()) ?? -1) - item.mtimeMs) > 1)
    .map((item) => item.path);
  return {
    full: changedPaths.length > 40,
    changedPaths: changedPaths.length > 40 ? [] : changedPaths,
  };
}

async function updateGraphFiles(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const dbPath = resolveDbPath(args, root);
  const ignore = await loadIgnoreMatcher(root);
  let db;
  try {
    db = await readGraphDb(args, root);
  } catch {
    return updateGraph(args);
  }

  const requestedPaths = normalizeRequestedPaths(args);
  if (!requestedPaths.length) return updateGraph(args);
  if (requestedPaths.some((relPath) => ignore.isIgnored(relPath))) return updateGraph(args);
  const indexedPaths = new Set((db?.tables?.documents || []).map((doc) => String(doc.path || '').toLowerCase()));
  if (requestedPaths.some((relPath) => !indexedPaths.has(relPath.toLowerCase()))) {
    return updateGraph(args);
  }

  const documents = [];
  for (const relPath of requestedPaths) {
    const fullPath = path.join(root, relPath);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) return updateGraph(args);
      const source = await fs.readFile(fullPath, 'utf8');
      documents.push({ path: relPath, source, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      return updateGraph(args);
    }
  }
  const next = updateSourceGraphDocuments(db, documents, {
    root,
    updatedAt: new Date().toISOString(),
    includeExternal: true,
  });
  await writeSourceGraphSqlite(dbPath, next);
  return next;
}

async function collectMarkdownStats(root, include = '') {
  const stats = [];
  const includePrefix = include ? normalizeSlash(include).replace(/^\/+|\/+$/g, '') : '';
  const ignore = await loadIgnoreMatcher(root);
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.codex' && entry.name !== '.agents' && entry.name !== '.claude') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = normalizeSlash(path.relative(root, fullPath));
      if (ignore.isIgnored(relPath)) continue;
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (includePrefix && !relPath.startsWith(includePrefix)) continue;
      const stat = await fs.stat(fullPath);
      stats.push({ path: relPath, mtimeMs: stat.mtimeMs });
    }
  }
  await walk(root);
  return stats.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectMarkdownDocuments(root, include = '') {
  const docs = [];
  const includePrefix = include ? normalizeSlash(include).replace(/^\/+|\/+$/g, '') : '';
  const ignore = await loadIgnoreMatcher(root);
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.codex' && entry.name !== '.agents' && entry.name !== '.claude') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = normalizeSlash(path.relative(root, fullPath));
      if (ignore.isIgnored(relPath)) continue;
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (includePrefix && !relPath.startsWith(includePrefix)) continue;
      const stat = await fs.stat(fullPath);
      const source = await fs.readFile(fullPath, 'utf8');
      docs.push({
        path: relPath,
        source,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  }
  await walk(root);
  docs.sort((a, b) => a.path.localeCompare(b.path));
  return docs;
}

async function loadIgnoreMatcher(root) {
  const patterns = [...DEFAULT_IGNORE_PATTERNS];
  try {
    const source = await fs.readFile(path.join(root, MPS_IGNORE_FILE), 'utf8');
    patterns.push(...parseIgnoreRules(source));
  } catch {
    // Missing ignore file means only default generated folders are skipped.
  }
  return createIgnoreMatcher(patterns);
}

function resolveDbPath(args = {}, root = path.resolve(String(args.root || process.cwd()))) {
  const raw = String(args.db || DEFAULT_DB_REL);
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw);
}

async function readGraphDb(args = {}, root = path.resolve(String(args.root || process.cwd()))) {
  const dbPath = resolveDbPath(args, root);
  if (dbPath.toLowerCase().endsWith('.json')) {
    return JSON.parse(await fs.readFile(dbPath, 'utf8'));
  }
  try {
    return await readSourceGraphSqlite(dbPath);
  } catch (error) {
    const legacyPath = path.join(root, LEGACY_JSON_DB_REL);
    try {
      const legacy = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
      await writeSourceGraphSqlite(dbPath, legacy);
      return legacy;
    } catch {
      throw error;
    }
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const eq = item.indexOf('=');
    if (eq !== -1) {
      args[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function summarizeDb(db) {
  return {
    updatedAt: db.updatedAt,
    root: db.root,
    documents: db.tables.documents.length,
    headings: db.tables.headings.length,
    links: db.tables.links.length,
    graphNodes: db.graph.nodes.length,
    graphEdges: db.graph.edges.length,
  };
}

function enrichSearchResultsWithLinks(db, results = [], args = {}) {
  const linksDepth = getSearchLinksDepth(args);
  if (!linksDepth) return results;
  return results.map((doc) => {
    const neighborhood = getSourceGraphNeighbors(db, doc.id, linksDepth);
    return {
      ...doc,
      linksDepth,
      linkedDocuments: neighborhood.documents.filter((item) => item.id !== doc.id),
      links: neighborhood.links,
    };
  });
}

function getSearchLinksDepth(args = {}) {
  const includeLinks = args.includeLinks ?? args['include-links'] ?? args.links ?? args['with-links'];
  const explicitDepth = args.linksDepth ?? args['links-depth'] ?? args.linkDepth ?? args['link-depth'];
  if (includeLinks === false || includeLinks === 'false' || includeLinks === '0') return 0;
  if (explicitDepth !== undefined) return clampSearchLinksDepth(explicitDepth);
  if (includeLinks) return 1;
  return 0;
}

function clampSearchLinksDepth(value) {
  const depth = Number(value);
  if (!Number.isFinite(depth)) return 1;
  return Math.max(1, Math.min(3, Math.trunc(depth)));
}

function findRelatedDocuments(db, args = {}) {
  const limit = Math.max(1, Math.min(50, Number(args.limit || 10)));
  const pathOrId = String(args.path || args.id || '').trim();
  const query = String(args.query || '').trim();
  if (pathOrId) return relatedByDocument(db, pathOrId, limit);
  if (query) {
    const seeds = searchSourceGraph(db, query, Math.max(5, limit));
    const seen = new Map();
    for (const seed of seeds) {
      seen.set(seed.id, { ...seed, reason: 'search-hit', relatedScore: seed.score || 1 });
      for (const item of relatedByDocument(db, seed.id, limit)) {
        const current = seen.get(item.id);
        const score = (current?.relatedScore || 0) + item.relatedScore * 0.7;
        seen.set(item.id, { ...item, relatedScore: score, reason: current?.reason || item.reason });
      }
    }
    return [...seen.values()].sort((a, b) => b.relatedScore - a.relatedScore).slice(0, limit);
  }
  return [];
}

function relatedByDocument(db, pathOrId, limit = 10) {
  const startId = resolveDocIdForRelated(db, pathOrId);
  if (!startId) return [];
  const documents = new Map((db.tables.documents || []).map((doc) => [doc.id, doc]));
  const scores = new Map();
  const addScore = (id, delta, reason) => {
    if (!id || id === startId) return;
    const current = scores.get(id) || { id, relatedScore: 0, reasons: new Set() };
    current.relatedScore += delta;
    current.reasons.add(reason);
    scores.set(id, current);
  };
  for (const link of db.tables.links || []) {
    if (link.sourceDocumentId === startId) addScore(link.targetDocumentId, 8, 'outbound-link');
    if (link.targetDocumentId === startId) addScore(link.sourceDocumentId, 7, 'inbound-link');
  }
  const startDoc = documents.get(startId);
  const startTerms = importantTerms(`${startDoc?.title || ''} ${startDoc?.path || ''} ${startDoc?.snippet || ''}`);
  for (const doc of documents.values()) {
    if (doc.id === startId) continue;
    const terms = importantTerms(`${doc.title || ''} ${doc.path || ''} ${doc.snippet || ''}`);
    const overlap = [...startTerms].filter((term) => terms.has(term)).length;
    if (overlap) addScore(doc.id, Math.min(6, overlap), 'shared-terms');
  }
  return [...scores.values()]
    .map((item) => {
      const doc = documents.get(item.id);
      return doc
        ? {
            ...doc,
            relatedScore: Number(item.relatedScore.toFixed(2)),
            reason: [...item.reasons].join(', '),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.relatedScore - a.relatedScore || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function resolveDocIdForRelated(db, pathOrId) {
  const value = String(pathOrId || '').trim();
  if (!value) return '';
  const docs = db.tables.documents || [];
  if (docs.some((doc) => doc.id === value)) return value;
  const normalized = normalizeSlash(value).replace(/^\/+/, '').toLowerCase();
  return docs.find((doc) => String(doc.path || '').toLowerCase() === normalized)?.id || '';
}

function importantTerms(value) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', '문서', '보고서', '그리고', '또는']);
  const terms = String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}._-]+/u)
    .filter((term) => term.length >= 3 && !stop.has(term));
  return new Set(terms.slice(0, 120));
}

function printHelp() {
  process.stdout.write(`Agent Docs for Markdown source graph

Usage:
  node scripts/source-graph.mjs update [--root <workspace>] [--db .mps/source-graph.sqlite]
  node scripts/source-graph.mjs update-file --path <relative.md>
  node scripts/source-graph.mjs search --query <text> [--limit 20] [--include-links] [--links-depth 1]
  node scripts/source-graph.mjs neighbors --path <relative.md> [--depth 1]
  node scripts/source-graph.mjs related --path <relative.md> [--limit 10]
  node scripts/source-graph.mjs mcp [--root <workspace>]

The database is a SQLite file with tables:
documents, headings, links, citations, searchIndex, plus graph nodes/edges.
`);
}

function normalizeRequestedPaths(args = {}) {
  const rawItems = [
    ...(Array.isArray(args.path) ? args.path : args.path ? [args.path] : []),
    ...(args._ || []),
  ];
  return [...new Set(rawItems.map((item) => normalizeSlash(String(item || '')).replace(/^\/+/, '')).filter(Boolean))];
}

async function runMcpServer(args = {}) {
  let dbCache = null;
  const readDb = async (callArgs = {}) => {
    dbCache = await loadOrUpdateGraph({ ...args, ...callArgs });
    return dbCache;
  };
  const transport = new HeaderTransport(process.stdin, process.stdout);
  transport.onMessage = async (message) => {
    if (!message || typeof message !== 'object') return;
    if (message.method === 'initialize') {
      transport.send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'markdown-agent-docs-source-graph', version: '0.1.0' },
        },
      });
      return;
    }
    if (message.method === 'tools/list') {
      transport.send({ jsonrpc: '2.0', id: message.id, result: { tools: getMcpTools() } });
      return;
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const callArgs = message.params?.arguments || {};
      const result = await safeCallMcpTool(name, callArgs, readDb);
      transport.send({ jsonrpc: '2.0', id: message.id, result });
      return;
    }
    if (message.id !== undefined) {
      transport.send({ jsonrpc: '2.0', id: message.id, result: {} });
    }
  };
  transport.start();
}

async function safeCallMcpTool(name, callArgs, readDb) {
  try {
    return await callMcpTool(name, callArgs, readDb);
  } catch (error) {
    return mcpErrorResult(name, error);
  }
}

function getMcpTools() {
  return [
    {
      name: 'source_graph_update',
      description: 'Rebuild the Agent Docs for Markdown source graph database for the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          db: { type: 'string' },
          include: { type: 'string' },
        },
      },
    },
    {
      name: 'source_graph_search',
      description: 'Search indexed Markdown documents by title, path, and content.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
          includeLinks: { type: 'boolean' },
          linksDepth: { type: 'number' },
          update: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
    {
      name: 'source_graph_neighbors',
      description: 'Return inbound and outbound graph neighbors for a document path or document id.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          id: { type: 'string' },
          depth: { type: 'number' },
          update: { type: 'boolean' },
        },
      },
    },
    {
      name: 'source_graph_related',
      description: 'Find documents related to a path/id or query using links, backlinks, and shared source terms.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          id: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'number' },
          update: { type: 'boolean' },
        },
      },
    },
  ];
}

async function callMcpTool(name, callArgs, readDb) {
  if (name === 'source_graph_update') {
    const db = await updateGraph(callArgs);
    return contentResult(summarizeDb(db));
  }
  if (name === 'source_graph_search') {
    const db = await readDb(callArgs);
    return contentResult(enrichSearchResultsWithLinks(
      db,
      searchSourceGraph(db, callArgs.query, Number(callArgs.limit || 20)),
      callArgs,
    ));
  }
  if (name === 'source_graph_neighbors') {
    const db = await readDb(callArgs);
    return contentResult(getSourceGraphNeighbors(db, callArgs.path || callArgs.id, Number(callArgs.depth || 1)));
  }
  if (name === 'source_graph_related') {
    const db = await readDb(callArgs);
    return contentResult(findRelatedDocuments(db, callArgs));
  }
  return {
    isError: true,
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
  };
}

function contentResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function mcpErrorResult(name, error) {
  const detail = stringifyError(error);
  const diagnosis = diagnoseMcpError(detail);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          tool: name,
          error: diagnosis.title,
          cause: diagnosis.cause,
          fix: diagnosis.fix,
          detail,
        }, null, 2),
      },
    ],
  };
}

function diagnoseMcpError(detail) {
  const lower = String(detail || '').toLowerCase();
  if (lower.includes('enoent')) {
    return {
      title: 'Source graph path error',
      cause: 'A workspace path, database path, or Markdown file path could not be found.',
      fix: 'Check the MCP --root path, then run source_graph_update or reinstall the workspace MCP config.',
    };
  }
  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission')) {
    return {
      title: 'Source graph permission error',
      cause: 'The MCP server cannot read Markdown files or write .mps/source-graph.sqlite.',
      fix: 'Check folder permissions and close tools that may lock .mps/source-graph.sqlite.',
    };
  }
  if (lower.includes('json') || lower.includes('unexpected token')) {
    return {
      title: 'Source graph database error',
      cause: 'The graph database SQLite file is corrupt or partially written.',
      fix: 'Delete .mps/source-graph.sqlite and call source_graph_update again.',
    };
  }
  return {
    title: 'Source graph MCP tool failed',
    cause: 'The requested MCP tool did not complete successfully.',
    fix: 'Run source_graph_update, then retry the search/related/neighbors call. If it still fails, inspect the detail field.',
  };
}

function stringifyError(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

class HeaderTransport {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.buffer = Buffer.alloc(0);
    this.onMessage = null;
  }

  start() {
    this.input.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.readMessages();
    });
  }

  readMessages() {
    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      const altHeaderEnd = this.buffer.indexOf('\n\n');
      const end = headerEnd >= 0 ? headerEnd : altHeaderEnd;
      const separatorLength = headerEnd >= 0 ? 4 : 2;
      if (end < 0) {
        const newline = this.buffer.indexOf('\n');
        if (newline < 0) return;
        const line = this.buffer.slice(0, newline).toString('utf8').trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        this.dispatchJson(line);
        continue;
      }
      const header = this.buffer.slice(0, end).toString('utf8');
      const lengthMatch = header.match(/content-length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(end + separatorLength);
        continue;
      }
      const length = Number(lengthMatch[1]);
      const bodyStart = end + separatorLength;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;
      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.slice(bodyEnd);
      this.dispatchJson(body);
    }
  }

  dispatchJson(text) {
    try {
      const message = JSON.parse(text);
      void this.onMessage?.(message);
    } catch (error) {
      // Ignore malformed client frames.
    }
  }

  send(message) {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    this.output.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.output.write(body);
  }
}

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
