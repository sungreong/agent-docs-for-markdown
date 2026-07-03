#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  buildSourceGraphIndex,
  getSourceGraphNeighbors,
  hashSourceGraphSource,
  searchSourceGraph,
  updateSourceGraphDocuments,
} from '../public/core/source-graph.js';
import {
  patchSourceGraphSqlite,
  readSourceGraphChangeMetadataSqlite,
  readSourceGraphAuditSqlite,
  readSourceGraphIncrementalSqlite,
  readSourceGraphSqlite,
  searchSourceGraphSqlite,
  sourceGraphSqliteSummary,
  writeSourceGraphSqlite,
} from '../public/core/source-graph-sqlite.js';
import { LEGACY_MPS_IGNORE_FILE, MPS_IGNORE_FILE, MPS_IGNORE_FILES, createIgnoreMatcher, parseIgnoreRules } from '../public/core/ignore-rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_DB_REL = '.mps/source-graph.sqlite';
const LEGACY_JSON_DB_REL = '.mps/source-graph.json';
const AUDIT_CACHE_REL = '.mps/source-graph-audit-cache.json';
const AUDIT_CACHE_VERSION = 1;
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.mdown', '.mkd', '.mkdn']);
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', 'out', 'coverage']);
const DEFAULT_IGNORE_PATTERNS = ['.mps/**'];
const ALLOWED_HIDDEN_MARKDOWN_DIRS = new Set(['.agents', '.claude', '.codex', '.gemini', '.cursor']);
const IGNORE_AUDIT_ROOTS = [
  {
    pattern: '.codex/**',
    kind: 'agent-skill-copy',
    confidence: 'high',
    reason: 'Workspace-local Codex skills are usually duplicate support docs, not user-authored Markdown content.',
    matches: (item) => item.path.startsWith('.codex/'),
  },
  {
    pattern: '.agents/**',
    kind: 'agent-skill-copy',
    confidence: 'high',
    reason: 'Workspace-local Agents skills usually pollute Markdown graph search unless you are auditing the skill pack itself.',
    matches: (item) => item.path.startsWith('.agents/'),
  },
  {
    pattern: '.claude/**',
    kind: 'agent-skill-copy',
    confidence: 'high',
    reason: 'Workspace-local Claude skills are usually duplicate support docs, not shared Markdown pages.',
    matches: (item) => item.path.startsWith('.claude/'),
  },
  {
    pattern: '.gemini/**',
    kind: 'agent-skill-copy',
    confidence: 'high',
    reason: 'Workspace-local Gemini skills are usually duplicate support docs, not shared Markdown pages.',
    matches: (item) => item.path.startsWith('.gemini/'),
  },
  {
    pattern: '.cursor/**',
    kind: 'agent-skill-copy',
    confidence: 'high',
    reason: 'Workspace-local Cursor skills are usually duplicate support docs, not shared Markdown pages.',
    matches: (item) => item.path.startsWith('.cursor/'),
  },
  {
    pattern: 'ai_skills/**',
    kind: 'bundled-skill-source',
    confidence: 'medium',
    reason: 'Bundled skill sources are useful for package maintenance, but are usually noise during end-user Markdown search.',
    matches: (item) => item.path.startsWith('ai_skills/'),
  },
  {
    pattern: 'vscode-extension/ai_skills/**',
    kind: 'bundled-skill-copy',
    confidence: 'high',
    reason: 'VS Code bundled skill copies duplicate the root skill pack and rarely belong in a document-focused search corpus.',
    matches: (item) => item.path.startsWith('vscode-extension/ai_skills/'),
  },
  {
    pattern: 'test/**',
    kind: 'test-fixture',
    confidence: 'low',
    reason: 'Test Markdown is a candidate for exclusion when it is mostly fixture or regression content rather than living product documentation.',
    matches: (item) => item.path.startsWith('test/'),
  },
];

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const args = parseArgs(argv.slice(1));
  if (command !== 'help') await ensureMpsWorkspaceFiles(path.resolve(String(args.root || process.cwd())));
  if (command === 'update') {
    const db = await updateGraph(args);
    if (args.json) await writeJson(summarizeDb(db), args);
    else process.stdout.write(`Source graph updated: ${resolveDbPath(args)}\n`);
    return;
  }
  if (command === 'update-file') {
    const db = await updateGraphFiles(args);
    if (args.json) await writeJson(summarizeDb(db), args);
    else process.stdout.write(`Source graph file update applied: ${resolveDbPath(args)}\n`);
    return;
  }
  if (command === 'search') {
    if (canUseFastSqliteSearch(args)) {
      const results = await searchSourceGraphDocumentsFast(args);
      await writeJson(formatDocumentResults(results, args), args);
      return;
    }
    const db = await loadOrUpdateGraph(args);
    const results = enrichSearchResultsWithLinks(
      db,
      enrichDocumentsWithHeadings(db, searchSourceGraphDocuments(db, String(args.query || args._[0] || ''), args), args),
      args,
    );
    await writeJson(formatDocumentResults(results, args), args);
    return;
  }
  if (command === 'neighbors') {
    const db = await loadOrUpdateGraph(args);
    const result = getSourceGraphNeighbors(db, String(args.path || args.id || args._[0] || ''), Number(args.depth || 1));
    await writeJson(result, args);
    return;
  }
  if (command === 'related') {
    const db = await loadOrUpdateGraph(args);
    const result = enrichDocumentsWithHeadings(db, findRelatedDocuments(db, args), args);
    await writeJson(formatDocumentResults(result, args), args);
    return;
  }
  if (command === 'audit') {
    const profile = createProfileRecorder(args);
    profile.mark('start');
    if (isSummaryOnlyAudit(args)) {
      const result = await buildSourceGraphAuditSummary(args);
      profile.mark('summary');
      profile.report('audit-summary', { indexedDocuments: result.summary.indexedDocuments, links: result.summary.links });
      await writeJson(result, args);
      return;
    }
    const db = await loadOrUpdateAuditGraph(args);
    profile.mark('load-db');
    const result = await buildSourceGraphAudit(db, args);
    profile.mark('audit');
    profile.report('audit', { markdownFiles: result.summary.markdownFiles, indexedDocuments: result.summary.indexedDocuments });
    await writeJson(result, args);
    return;
  }
  printHelp();
}

function isSummaryOnlyAudit(args = {}) {
  return args.summary === true || args.summaryOnly === true || args['summary-only'] === true;
}

async function ensureMpsWorkspaceFiles(root) {
  const ignorePath = path.join(root, MPS_IGNORE_FILE);
  await fs.mkdir(path.dirname(ignorePath), { recursive: true });
  try {
    await fs.access(ignorePath);
    return ignorePath;
  } catch {
    // Create below.
  }
  let source = '';
  try {
    source = await fs.readFile(path.join(root, LEGACY_MPS_IGNORE_FILE), 'utf8');
  } catch {
    source = buildSourceIgnoreTemplate();
  }
  await fs.writeFile(ignorePath, source, 'utf8');
  return ignorePath;
}

function buildSourceIgnoreTemplate() {
  return [
    '# Agent Docs ignore rules',
    '# One glob per line. Run `node scripts/source-graph.mjs audit --root .` first when you want recommendations.',
    '# Uncomment examples when you want them hidden from Source Graph and Agent Docs File Browser.',
    '#',
    '# .codex/**',
    '# .agents/**',
    '# .claude/**',
    '# .gemini/**',
    '# .cursor/**',
    '# ai_skills/**',
    '# vscode-extension/ai_skills/**',
    '# test/**',
    '# .vscode-test/**',
    '# raw/**',
    '# **/drafts/**',
    '# *.draft.md',
    '',
  ].join('\n');
}

async function updateGraph(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const include = String(args.include || '').trim();
  const profile = createProfileRecorder(args);
  profile.mark('start');
  const documents = await collectMarkdownDocuments(root, include);
  profile.mark('collect');
  const db = buildSourceGraphIndex(documents, { root, updatedAt: new Date().toISOString(), includeExternal: true });
  profile.mark('build');
  const dbPath = resolveDbPath(args, root);
  await writeSourceGraphSqlite(dbPath, db);
  profile.mark('write');
  profile.report('update', { documents: db.tables.documents.length, headings: db.tables.headings.length, links: db.tables.links.length });
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

async function loadOrUpdateAuditGraph(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const dbPath = resolveDbPath(args, root);
  if (args.update) return updateGraph(args);
  try {
    const metadata = await readSourceGraphChangeMetadataSqlite(dbPath);
    const freshnessArgs = args.freshnessMs === undefined && args['freshness-ms'] === undefined
      ? { ...args, freshnessMs: 300000 }
      : args;
    if (args.noAutoUpdate !== true && args['no-auto-update'] !== true && !isRecentlyUpdatedSourceGraph(metadata, freshnessArgs)) {
      const changes = await getGraphDbChangeSet(metadata, args);
      if (changes.full) return updateGraph(args);
      if (changes.changedPaths.length) await updateGraphFiles({ ...args, path: changes.changedPaths });
    }
    return await readSourceGraphAuditSqlite(dbPath);
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
  const indexedByPath = new Map(indexed.map((doc) => [String(doc.path || '').toLowerCase(), doc]));
  const statByPath = new Map(stats.map((item) => [item.path.toLowerCase(), item]));
  if (indexed.some((doc) => !statByPath.has(String(doc.path || '').toLowerCase()))) {
    return { full: true, changedPaths: [] };
  }
  const changedCandidates = stats.filter((item) => {
    const indexedDoc = indexedByPath.get(item.path.toLowerCase());
    if (!indexedDoc) return true;
    if (Number(indexedDoc.size || 0) !== Number(item.size || 0)) return true;
    return Math.abs(Number(indexedDoc.mtimeMs || 0) - item.mtimeMs) > 1;
  });
  const changedPaths = await filterContentChangedPaths(root, changedCandidates, indexedByPath);
  return {
    full: changedPaths.length > 40,
    changedPaths: changedPaths.length > 40 ? [] : changedPaths,
  };
}

async function filterContentChangedPaths(root, candidates = [], indexedByPath = new Map()) {
  const changed = [];
  for (const item of candidates) {
    const indexedDoc = indexedByPath.get(item.path.toLowerCase());
    const oldHash = String(indexedDoc?.sourceHash || '');
    if (!oldHash) {
      changed.push(item.path);
      continue;
    }
    try {
      const source = await fs.readFile(path.join(root, item.path), 'utf8');
      if (hashSourceGraphSource(source) !== oldHash) changed.push(item.path);
    } catch {
      changed.push(item.path);
    }
  }
  return changed;
}

async function updateGraphFiles(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const dbPath = resolveDbPath(args, root);
  const profile = createProfileRecorder(args);
  profile.mark('start');
  const ignore = await loadIgnoreMatcher(root);
  profile.mark('ignore');
  let db;
  try {
    db = await readSourceGraphIncrementalSqlite(dbPath);
    profile.mark('read-db');
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
  profile.mark('read-files');
  const next = updateSourceGraphDocuments(db, documents, {
    root,
    updatedAt: new Date().toISOString(),
    includeExternal: true,
  });
  profile.mark('build');
  const changedDocumentIds = documents
    .map((item) => next.tables.documents.find((doc) => doc.path.toLowerCase() === item.path.toLowerCase())?.id)
    .filter(Boolean);
  await patchSourceGraphSqlite(dbPath, next, changedDocumentIds);
  profile.mark('write');
  profile.report('update-file', { documents: documents.length, changedDocumentIds: changedDocumentIds.length });
  return next;
}

async function collectMarkdownStats(root, include = '') {
  const files = await collectMarkdownFiles(root, include);
  return files.map((item) => ({ path: item.path, mtimeMs: item.mtimeMs, size: item.size }));
}

async function collectMarkdownDocuments(root, include = '') {
  return collectMarkdownFiles(root, include, { includeSource: true });
}

async function collectMarkdownFiles(root, include = '', options = {}) {
  const files = [];
  const includeSource = options.includeSource === true;
  const includeIgnored = options.includeIgnored === true;
  const sourceReads = [];
  const includePrefix = include ? normalizeSlash(include).replace(/^\/+|\/+$/g, '') : '';
  const ignore = await loadIgnoreMatcher(root);
  async function walk(dir) {
    const nextDirs = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && shouldSkipHiddenMarkdownDirectory(entry.name)) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = normalizeSlash(path.relative(root, fullPath));
      const ignored = ignore.isIgnored(relPath);
      if (entry.isDirectory()) {
        if (!includeIgnored && ignored) continue;
        nextDirs.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (includePrefix && !relPath.startsWith(includePrefix)) continue;
      if (!includeIgnored && ignored) continue;
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }
      const item = {
        path: relPath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        ignored,
      };
      if (includeSource) {
        sourceReads.push({ item, fullPath });
      }
      files.push(item);
    }
    if (nextDirs.length) await mapLimit(nextDirs, getDirectoryWalkConcurrency(options), walk);
  }
  await walk(root);
  if (includeSource && sourceReads.length) {
    await mapLimit(sourceReads, getFileReadConcurrency(options), async ({ item, fullPath }) => {
      try {
        item.source = await fs.readFile(fullPath, 'utf8');
      } catch {
        item.skip = true;
      }
    });
  }
  const readableFiles = files.filter((item) => !item.skip && (!includeSource || typeof item.source === 'string'));
  readableFiles.sort((a, b) => a.path.localeCompare(b.path));
  return readableFiles;
}

function shouldSkipHiddenMarkdownDirectory(name = '') {
  return name.startsWith('.') && !ALLOWED_HIDDEN_MARKDOWN_DIRS.has(name);
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

function getFileReadConcurrency(options = {}) {
  const raw = Number(options.readConcurrency || process.env.MPS_SOURCE_GRAPH_READ_CONCURRENCY || 16);
  if (!Number.isFinite(raw)) return 16;
  return Math.max(1, Math.min(64, Math.trunc(raw)));
}

function getDirectoryWalkConcurrency(options = {}) {
  const raw = Number(options.walkConcurrency || process.env.MPS_SOURCE_GRAPH_WALK_CONCURRENCY || 12);
  if (!Number.isFinite(raw)) return 12;
  return Math.max(1, Math.min(64, Math.trunc(raw)));
}

async function loadIgnoreMatcher(root) {
  return (await loadIgnoreConfig(root)).matcher;
}

async function loadIgnoreConfig(root) {
  const userPatterns = [];
  for (const ignoreFile of MPS_IGNORE_FILES) {
    try {
      const source = await fs.readFile(path.join(root, ignoreFile), 'utf8');
      userPatterns.push(...parseIgnoreRules(source));
    } catch {
      // Missing ignore files mean only default generated folders are skipped.
    }
  }
  const patterns = [...DEFAULT_IGNORE_PATTERNS, ...userPatterns];
  return {
    patterns,
    userPatterns,
    matcher: createIgnoreMatcher(patterns),
  };
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

async function buildSourceGraphAuditSummary(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const dbPath = resolveDbPath(args, root);
  if (args.update) await updateGraph(args);
  try {
    const summary = await sourceGraphSqliteSummary(dbPath);
    return formatSourceGraphAuditSummary(summary, root);
  } catch {
    await updateGraph(args);
    const summary = await sourceGraphSqliteSummary(dbPath);
    return formatSourceGraphAuditSummary(summary, root);
  }
}

function formatSourceGraphAuditSummary(summary = {}, fallbackRoot = process.cwd()) {
  return {
    root: summary.root || fallbackRoot,
    updatedAt: summary.updatedAt,
    mode: 'summary-only',
    summary: {
      indexedDocuments: summary.documents,
      headings: summary.headings,
      links: summary.links,
      unresolvedInternalLinks: summary.unresolvedInternalLinks,
      orphanDocuments: summary.orphanDocuments,
      graphNodes: summary.graphNodes,
      graphEdges: summary.graphEdges,
    },
    notes: [
      'Summary-only audit uses SQLite aggregate counts and skips workspace inventory review.',
      'Run full audit when you need ignore recommendations, duplicate copy groups, or review items.',
    ],
  };
}

async function buildSourceGraphAudit(db, args = {}) {
  const root = path.resolve(String(args.root || db.root || process.cwd()));
  const include = String(args.include || '').trim();
  const [inventory, ignoreConfig] = await Promise.all([
    collectMarkdownFiles(root, include, { includeIgnored: true }),
    loadIgnoreConfig(root),
  ]);
  const indexedDocuments = dedupeSourceGraphDocuments(db?.tables?.documents || []);
  const unresolvedLinks = collectUnresolvedInternalLinks(db);
  const inventoryAudit = await loadOrBuildAuditInventoryCache(root, include, inventory, ignoreConfig, args);
  const duplicateCopyGroups = inventoryAudit.duplicateCopyGroups;
  const ignoreAudit = inventoryAudit.ignoreAudit;
  const orphanDocuments = indexedDocuments
    .filter((doc) => Number(doc.incomingCount || 0) === 0)
    .sort((a, b) => Number(b.outgoingCount || 0) - Number(a.outgoingCount || 0) || String(a.path || '').localeCompare(String(b.path || '')))
    .slice(0, 20)
    .map((doc) => summarizeAuditDocument(doc));
  const entryDocuments = [...indexedDocuments]
    .sort((a, b) => Number(b.incomingCount || 0) - Number(a.incomingCount || 0) || Number(b.outgoingCount || 0) - Number(a.outgoingCount || 0) || String(a.path || '').localeCompare(String(b.path || '')))
    .slice(0, 12)
    .map((doc) => summarizeAuditDocument(doc));
  return {
    root,
    updatedAt: db.updatedAt,
    summary: {
      markdownFiles: inventory.length,
      indexedDocuments: db?.tables?.documents?.length || 0,
      ignoredMarkdownFiles: inventory.filter((item) => item.ignored).length,
      unresolvedInternalLinks: unresolvedLinks.length,
      duplicateCopyGroups: duplicateCopyGroups.length,
      orphanDocuments: orphanDocuments.length,
    },
    ignore: {
      defaultPatterns: [...DEFAULT_IGNORE_PATTERNS],
      userPatterns: [...ignoreConfig.userPatterns],
      activePatterns: [...ignoreConfig.patterns],
      recommendations: ignoreAudit.recommendations,
      reviewItems: ignoreAudit.reviewItems,
    },
    graph: {
      entryDocuments,
      orphanDocuments,
      unresolvedLinks,
      duplicateCopyGroups,
    },
    notes: [
      'Use ignore recommendations to reduce search noise before asking an agent to write, analyze, or reorganize Markdown content.',
      'Treat ai_skills and local agent skill folders as optional search scope; keep them indexed only when auditing the skill pack itself.',
      'Unreferenced documents are review candidates, not automatic problems.',
      'Entry documents are good seeds for context packaging and canonical-page review.',
      inventoryAudit.cacheHit ? 'Audit inventory recommendations were reused from the .mps cache.' : 'Audit inventory recommendations were refreshed from the current workspace inventory.',
    ],
  };
}

async function loadOrBuildAuditInventoryCache(root, include, inventory = [], ignoreConfig = {}, args = {}) {
  const signature = buildAuditInventorySignature(root, include, inventory, ignoreConfig);
  if (canUseAuditInventoryCache(args)) {
    const cached = await readAuditInventoryCache(root);
    if (
      cached?.version === AUDIT_CACHE_VERSION &&
      cached?.signature === signature &&
      cached?.payload?.ignoreAudit &&
      Array.isArray(cached.payload.duplicateCopyGroups)
    ) {
      return { ...cached.payload, cacheHit: true };
    }
  }
  const payload = {
    duplicateCopyGroups: collectDuplicateCopyGroups(inventory),
    ignoreAudit: buildIgnoreAudit(inventory, ignoreConfig.matcher),
    markdownFiles: inventory.length,
    ignoredMarkdownFiles: inventory.filter((item) => item.ignored).length,
  };
  if (canUseAuditInventoryCache(args)) {
    await writeAuditInventoryCache(root, {
      version: AUDIT_CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      signature,
      root,
      include,
      payload,
    });
  }
  return { ...payload, cacheHit: false };
}

function canUseAuditInventoryCache(args = {}) {
  return args.cache !== false && args.noCache !== true && args['no-cache'] !== true;
}

function buildAuditInventorySignature(root, include, inventory = [], ignoreConfig = {}) {
  const hash = crypto.createHash('sha1');
  hash.update(`root:${normalizeSlash(root)}\n`);
  hash.update(`include:${include || ''}\n`);
  hash.update(`patterns:${JSON.stringify(ignoreConfig.patterns || [])}\n`);
  for (const item of inventory) {
    hash.update(`${item.path}\t${Math.trunc(Number(item.mtimeMs || 0))}\t${Number(item.size || 0)}\t${item.ignored ? 1 : 0}\n`);
  }
  return hash.digest('hex');
}

async function readAuditInventoryCache(root) {
  try {
    return JSON.parse(await fs.readFile(resolveAuditCachePath(root), 'utf8'));
  } catch {
    return null;
  }
}

async function writeAuditInventoryCache(root, cache) {
  const cachePath = resolveAuditCachePath(root);
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cache)}\n`, 'utf8');
  } catch {
    // Audit cache is an optimization only; never fail the audit because cache writes failed.
  }
}

function resolveAuditCachePath(root) {
  return path.join(root, AUDIT_CACHE_REL);
}

function summarizeAuditDocument(doc = {}) {
  return {
    path: doc.path,
    title: doc.title,
    incomingCount: doc.incomingCount,
    outgoingCount: doc.outgoingCount,
    headingCount: doc.headingCount,
    wordCount: doc.wordCount,
    snippet: doc.snippet,
  };
}

function collectUnresolvedInternalLinks(db = {}) {
  return (db?.tables?.links || [])
    .filter((link) => isUnresolvedInternalLink(link))
    .slice(0, 50)
    .map((link) => ({
      sourcePath: link.sourcePath,
      href: link.href,
      label: link.label,
      line: link.line,
      type: link.type,
      status: link.status,
    }));
}

function isUnresolvedInternalLink(link = {}) {
  if (!link) return false;
  if (link.type === 'url' || link.type === 'image') return false;
  return !['resolved', 'resolved-by-name', 'external'].includes(String(link.status || ''));
}

function collectDuplicateCopyGroups(files = []) {
  const groups = new Map();
  for (const item of files) {
    const key = canonicalSourceGraphPathKey(item.path || '');
    if (!key.startsWith('skill:')) continue;
    const list = groups.get(key) || [];
    list.push(item.path);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([key, paths]) => ({
      key,
      count: paths.length,
      paths: [...paths].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 30);
}

function buildIgnoreAudit(files = [], matcher) {
  const recommendations = IGNORE_AUDIT_ROOTS
    .map((rule) => buildIgnoreRecommendation(rule, files))
    .filter(Boolean);
  const reviewItems = buildIgnoreReviewItems(files, matcher);
  return { recommendations, reviewItems };
}

function buildIgnoreRecommendation(rule, files = []) {
  const matches = files.filter((item) => rule.matches(item));
  if (!matches.length) return null;
  const indexedMatches = matches.filter((item) => !item.ignored);
  const ignoredMatches = matches.filter((item) => item.ignored);
  const status = indexedMatches.length === 0 ? 'already-ignored' : ignoredMatches.length ? 'mixed' : 'candidate';
  const examples = (indexedMatches.length ? indexedMatches : matches).slice(0, 5).map((item) => item.path);
  return {
    pattern: rule.pattern,
    kind: rule.kind,
    confidence: rule.confidence,
    status,
    reason: rule.reason,
    indexedCount: indexedMatches.length,
    ignoredCount: ignoredMatches.length,
    totalMatches: matches.length,
    examples,
  };
}

function buildIgnoreReviewItems(files = [], matcher) {
  const reviewItems = [];
  for (const item of files) {
    if (item.ignored) continue;
    if (/\.draft\.(?:md|mdx|markdown|mdown|mkd|mkdn)$/i.test(item.path)) {
      reviewItems.push({
        path: item.path,
        kind: 'draft-file',
        confidence: 'high',
        suggestedPattern: '*.draft.md',
        reason: 'Draft-style Markdown files are usually low-signal for shared Markdown search.',
      });
      continue;
    }
    if (/(^|\/)drafts?\//i.test(item.path)) {
      reviewItems.push({
        path: item.path,
        kind: 'draft-folder',
        confidence: 'medium',
        suggestedPattern: '**/drafts/**',
        reason: 'Draft folders often contain exploratory notes that agents should not treat as canonical Markdown content.',
      });
      continue;
    }
    if (/(^|\/)(archive|archives|scratch|tmp)\//i.test(item.path)) {
      reviewItems.push({
        path: item.path,
        kind: 'low-signal-folder',
        confidence: 'medium',
        suggestedPattern: suggestFolderPattern(item.path),
        reason: 'Archive, scratch, or tmp folders are good candidates for exclusion when the graph should prioritize living Markdown pages.',
      });
      continue;
    }
    if (/^(?:ai_docs)\//i.test(item.path) && !matcher.isIgnored(item.path)) {
      reviewItems.push({
        path: item.path,
        kind: 'planning-note',
        confidence: 'low',
        suggestedPattern: 'ai_docs/**',
        reason: 'Planning notes can be useful during maintenance, but may add noise when agents should focus on published Markdown pages.',
      });
    }
  }
  return reviewItems.slice(0, 40);
}

function suggestFolderPattern(filePath = '') {
  const normalized = normalizeSlash(filePath).replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (segments.length < 2) return `${segments[0] || normalized}/**`;
  return `${segments.slice(0, -1).join('/')}/**`;
}

function enrichSearchResultsWithLinks(db, results = [], args = {}) {
  const linksDepth = getSearchLinksDepth(args);
  if (!linksDepth) return results;
  return results.map((doc) => {
    const neighborhood = getSourceGraphNeighbors(db, doc.id, linksDepth);
    const linkedDocuments = dedupeSourceGraphDocuments(
      filterSourceGraphDocumentsForDefaultScope(
        neighborhood.documents.filter((item) => item.id !== doc.id),
        args,
      ),
      args,
    );
    return {
      ...doc,
      linksDepth,
      linkedDocuments,
      links: dedupeSourceGraphLinks(filterSourceGraphLinksForDefaultScope(neighborhood.links, args), args),
    };
  });
}

function searchSourceGraphDocuments(db, query = '', args = {}) {
  const limit = clampResultLimit(args.limit, 20);
  return dedupeSourceGraphDocuments(
    filterSourceGraphDocumentsForDefaultScope(
      searchSourceGraph(db, String(query || ''), expandedResultLimit(limit, args)),
      args,
    ),
    args,
  ).slice(0, limit);
}

async function searchSourceGraphDocumentsFast(args = {}) {
  const root = path.resolve(String(args.root || process.cwd()));
  const query = String(args.query || args._?.[0] || '');
  const limit = clampResultLimit(args.limit, 20);
  await ensureSqliteGraphForFastSearch(args, root);
  return dedupeSourceGraphDocuments(
    filterSourceGraphDocumentsForDefaultScope(await searchSourceGraphSqlite(resolveDbPath(args, root), query, {
      mode: getSearchMode(args),
      limit: expandedResultLimit(limit, args),
      excludeSkillCopies: !shouldIncludeDuplicateCopies(args),
    }), args),
    args,
  ).slice(0, limit);
}

async function ensureSqliteGraphForFastSearch(args = {}, root = path.resolve(String(args.root || process.cwd()))) {
  if (args.update) {
    await updateGraph(args);
    return;
  }
  const dbPath = resolveDbPath(args, root);
  let metadata;
  try {
    metadata = await readSourceGraphChangeMetadataSqlite(dbPath);
  } catch {
    await updateGraph(args);
    return;
  }
  if (args.noAutoUpdate === true || args['no-auto-update'] === true) return;
  if (isRecentlyUpdatedSourceGraph(metadata, args)) return;
  const changes = await getGraphDbChangeSet(metadata, args);
  if (changes.full) {
    await updateGraph(args);
    return;
  }
  if (changes.changedPaths.length) {
    await updateGraphFiles({ ...args, path: changes.changedPaths });
  }
}

function canUseFastSqliteSearch(args = {}) {
  return !shouldIncludeHeadings(args) && !getSearchLinksDepth(args);
}

function getSearchMode(args = {}) {
  const mode = String(args.mode || args.searchMode || args['search-mode'] || '').toLowerCase();
  return mode === 'file' || mode === 'path' || mode === 'filename' ? 'file' : 'body';
}

function isRecentlyUpdatedSourceGraph(db = {}, args = {}) {
  const freshnessMs = Number(args.freshnessMs ?? args['freshness-ms'] ?? 30000);
  if (!Number.isFinite(freshnessMs) || freshnessMs <= 0) return false;
  const updatedAt = Date.parse(db.updatedAt || '');
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < freshnessMs;
}

function createProfileRecorder(args = {}) {
  const enabled = args.profile === true || args.profile === 'true';
  const marks = [];
  return {
    mark(label) {
      if (enabled) marks.push({ label, time: performance.now() });
    },
    report(label, extra = {}) {
      if (!enabled || marks.length < 2) return;
      const segments = [];
      for (let index = 1; index < marks.length; index += 1) {
        segments.push(`${marks[index - 1].label}->${marks[index].label}=${Math.round(marks[index].time - marks[index - 1].time)}ms`);
      }
      process.stderr.write(`[source-graph:${label}] ${segments.join(' ')} ${JSON.stringify(extra)}\n`);
    },
  };
}

function enrichDocumentsWithHeadings(db, results = [], args = {}) {
  if (!shouldIncludeHeadings(args)) return results;
  const limit = getHeadingLimit(args);
  const byDocumentId = new Map();
  for (const heading of db?.tables?.headings || []) {
    const list = byDocumentId.get(heading.documentId) || [];
    list.push({
      title: heading.title,
      depth: heading.depth,
      line: heading.line,
      slug: heading.slug,
    });
    byDocumentId.set(heading.documentId, list);
  }
  return results.map((doc) => ({
    ...doc,
    headings: (byDocumentId.get(doc.id) || []).slice(0, limit),
  }));
}

function dedupeSourceGraphDocuments(results = [], args = {}) {
  if (shouldIncludeDuplicateCopies(args)) return results;
  const byKey = new Map();
  for (const item of results) {
    const key = canonicalSourceGraphResultKey(item);
    const current = byKey.get(key);
    if (!current || compareSourceGraphResults(item, current) < 0) byKey.set(key, item);
  }
  return [...byKey.values()].sort(compareSourceGraphResults);
}

function dedupeSourceGraphLinks(links = [], args = {}) {
  if (shouldIncludeDuplicateCopies(args)) return links;
  const byKey = new Map();
  for (const link of links) {
    const key = canonicalSourceGraphLinkKey(link);
    const current = byKey.get(key);
    if (!current || compareLinkPreference(link, current) < 0) byKey.set(key, link);
  }
  return [...byKey.values()];
}

function filterSourceGraphDocumentsForDefaultScope(results = [], args = {}) {
  if (shouldIncludeDuplicateCopies(args)) return results;
  return results.filter((item) => !isOptionalSourceGraphSkillPath(item.path || ''));
}

function filterSourceGraphLinksForDefaultScope(links = [], args = {}) {
  if (shouldIncludeDuplicateCopies(args)) return links;
  return links.filter((link) => !isOptionalSourceGraphSkillPath(link.sourcePath || '')
    && !isOptionalSourceGraphSkillPath(link.targetPath || ''));
}

function canonicalSourceGraphLinkKey(link = {}) {
  const source = canonicalSourceGraphPathKey(link.sourcePath || link.sourceDocumentId || '');
  const target = canonicalSourceGraphPathKey(link.targetPath || link.targetDocumentId || link.href || '');
  return [
    source,
    target,
    link.type || '',
    link.label || '',
    link.line || '',
  ].join('|').toLowerCase();
}

function compareLinkPreference(a = {}, b = {}) {
  const priority = sourceGraphPathPriority(b.sourcePath) - sourceGraphPathPriority(a.sourcePath);
  if (priority !== 0) return priority;
  return String(a.sourcePath || '').localeCompare(String(b.sourcePath || ''));
}

function canonicalSourceGraphResultKey(item = {}) {
  return canonicalSourceGraphPathKey(item.path || '');
}

function canonicalSourceGraphPathKey(value = '') {
  const normalizedPath = normalizeSlash(value).replace(/^\.\//, '');
  const skillMatch = normalizedPath.match(sourceGraphSkillPathRegex());
  if (skillMatch) return `skill:${skillMatch[1]}/${skillMatch[2]}`.toLowerCase();
  return normalizedPath.toLowerCase();
}

function isOptionalSourceGraphSkillPath(value = '') {
  return sourceGraphSkillPathRegex().test(normalizeSlash(value).replace(/^\.\//, ''));
}

function sourceGraphSkillPathRegex() {
  return /^(?:vscode-extension\/)?(?:\.codex|\.agents|\.claude|\.gemini|\.cursor|ai_skills\/[^/]+)\/skills\/([^/]+)\/(.+)$/;
}

function compareSourceGraphResults(a = {}, b = {}) {
  const scoreA = Number(a.relatedScore ?? a.score ?? 0);
  const scoreB = Number(b.relatedScore ?? b.score ?? 0);
  if (scoreA !== scoreB) return scoreB - scoreA;
  const priority = sourceGraphPathPriority(b.path) - sourceGraphPathPriority(a.path);
  if (priority !== 0) return priority;
  return String(a.path || '').localeCompare(String(b.path || ''));
}

function sourceGraphPathPriority(value = '') {
  const normalizedPath = normalizeSlash(value);
  if (normalizedPath === 'README.md') return 100;
  if (/^README(?:\.[^.]+)?\.md$/i.test(normalizedPath)) return 95;
  if (normalizedPath.startsWith('.codex/skills/')) return 60;
  if (normalizedPath.startsWith('.agents/skills/')) return 55;
  if (normalizedPath.startsWith('.claude/skills/')) return 50;
  if (normalizedPath.startsWith('.gemini/skills/')) return 48;
  if (normalizedPath.startsWith('.cursor/skills/')) return 46;
  if (normalizedPath.startsWith('ai_skills/codex/skills/')) return 45;
  if (normalizedPath.startsWith('ai_skills/agents/skills/')) return 40;
  if (normalizedPath.startsWith('ai_skills/claude/skills/')) return 35;
  if (normalizedPath.startsWith('ai_skills/gemini/skills/')) return 33;
  if (normalizedPath.startsWith('ai_skills/cursor/skills/')) return 31;
  if (normalizedPath.includes('/ai_skills/')) return 20;
  if (!normalizedPath.includes('/') && !normalizedPath.startsWith('.')) return 90;
  if (!normalizedPath.startsWith('.')) return 70;
  return 30;
}

function clampResultLimit(value, fallback = 20) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function expandedResultLimit(limit, args = {}) {
  if (shouldIncludeDuplicateCopies(args)) return limit;
  return Math.min(250, Math.max(limit, limit * 4));
}

function shouldIncludeDuplicateCopies(args = {}) {
  return args.includeCopies === true
    || args.includeCopies === 'true'
    || args['include-copies'] === true
    || args['include-copies'] === 'true';
}

function shouldIncludeHeadings(args = {}) {
  return args.includeHeadings === true
    || args.includeHeadings === 'true'
    || args['include-headings'] === true
    || args['include-headings'] === 'true'
    || args.headings === true
    || args.headings === 'true';
}

function getHeadingLimit(args = {}) {
  const limit = Number(args.headingLimit ?? args['heading-limit'] ?? 12);
  if (!Number.isFinite(limit)) return 12;
  return Math.max(1, Math.min(50, Math.trunc(limit)));
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

function formatDocumentResults(results = [], args = {}) {
  if (!shouldCompactResults(args)) return results;
  return results.map((doc) => compactSourceGraphDocument(doc, args));
}

function compactSourceGraphDocument(doc = {}, args = {}) {
  const result = {
    path: doc.path,
    title: doc.title,
  };
  if (doc.score !== undefined) result.score = doc.score;
  if (doc.relatedScore !== undefined) result.relatedScore = doc.relatedScore;
  if (doc.reason) result.reason = doc.reason;
  if (doc.headingCount !== undefined) result.headingCount = doc.headingCount;
  if (doc.incomingCount !== undefined) result.incomingCount = doc.incomingCount;
  if (doc.outgoingCount !== undefined) result.outgoingCount = doc.outgoingCount;
  if (doc.snippet) result.snippet = compactText(doc.snippet).slice(0, 240);
  if (Array.isArray(doc.headings)) {
    result.headings = doc.headings.slice(0, getHeadingLimit(args)).map((heading) => ({
      title: heading.title,
      line: heading.line,
      slug: heading.slug,
    }));
  }
  if (Array.isArray(doc.linkedDocuments)) {
    result.linkedDocuments = doc.linkedDocuments.slice(0, getLinkedDocumentLimit(args)).map((linked) => ({
      path: linked.path,
      title: linked.title,
      reason: linked.reason,
    }));
  }
  if (Array.isArray(doc.links)) {
    result.links = doc.links.slice(0, getLinkLimit(args)).map((link) => ({
      sourcePath: link.sourcePath,
      targetPath: link.targetPath,
      href: link.href,
      label: link.label,
      status: link.status,
      line: link.line,
    }));
  }
  return result;
}

function shouldCompactResults(args = {}) {
  return args.compact === true || args.compact === 'true' || args.summary === true || args.summary === 'true';
}

function getLinkedDocumentLimit(args = {}) {
  return clampResultLimit(args.linkedLimit ?? args['linked-limit'], 8);
}

function getLinkLimit(args = {}) {
  return clampResultLimit(args.linkLimit ?? args['link-limit'], 12);
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function writeJson(value, args = {}) {
  if (args.output) {
    const root = path.resolve(String(args.root || process.cwd()));
    const outputPath = path.isAbsolute(String(args.output))
      ? path.normalize(String(args.output))
      : path.join(root, String(args.output));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    const stat = await fs.stat(outputPath);
    process.stdout.write(`${JSON.stringify({ outputPath, bytes: stat.size }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function findRelatedDocuments(db, args = {}) {
  const limit = clampResultLimit(args.limit, 10);
  const pathOrId = String(args.path || args.id || '').trim();
  const query = String(args.query || '').trim();
  if (pathOrId) {
    return dedupeSourceGraphDocuments(
      filterSourceGraphDocumentsForDefaultScope(relatedByDocument(db, pathOrId, expandedResultLimit(limit, args)), args),
      args,
    )
      .slice(0, limit);
  }
  if (query) {
    const seeds = dedupeSourceGraphDocuments(
      filterSourceGraphDocumentsForDefaultScope(searchSourceGraph(db, query, expandedResultLimit(Math.max(5, limit), args)), args),
      args,
    )
      .slice(0, Math.max(5, limit));
    const seen = new Map();
    for (const seed of seeds) {
      seen.set(seed.id, { ...seed, reason: 'search-hit', relatedScore: seed.score || 1 });
      for (const item of relatedByDocument(db, seed.id, limit)) {
        const current = seen.get(item.id);
        const score = (current?.relatedScore || 0) + item.relatedScore * 0.7;
        seen.set(item.id, { ...item, relatedScore: score, reason: current?.reason || item.reason });
      }
    }
    return dedupeSourceGraphDocuments(
      filterSourceGraphDocumentsForDefaultScope([...seen.values()].sort(compareSourceGraphResults), args),
      args,
    ).slice(0, limit);
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
  process.stdout.write(`Agent Docs source graph

Usage:
  node scripts/source-graph.mjs update [--root <workspace>] [--db .mps/source-graph.sqlite]
  node scripts/source-graph.mjs update-file --path <relative.md>
  node scripts/source-graph.mjs search --query <text> [--mode body|file] [--limit 20] [--compact] [--output <path>] [--include-links] [--links-depth 1] [--include-headings] [--include-copies]
  node scripts/source-graph.mjs neighbors --path <relative.md> [--depth 1]
  node scripts/source-graph.mjs related --path <relative.md> [--limit 10] [--compact] [--output <path>] [--include-headings] [--include-copies]
  node scripts/source-graph.mjs audit [--root <workspace>]

The database is a SQLite file with tables:
documents, headings, links, citations, searchIndex, plus graph nodes/edges.
Search and related exclude local skill-copy folders by default; pass --include-copies when auditing bundled skills.
`);
}

function normalizeRequestedPaths(args = {}) {
  const rawItems = [
    ...(Array.isArray(args.path) ? args.path : args.path ? [args.path] : []),
    ...(args._ || []),
  ];
  return [...new Set(rawItems.map((item) => normalizeSlash(String(item || '')).replace(/^\/+/, '')).filter(Boolean))];
}

function normalizeSlash(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
