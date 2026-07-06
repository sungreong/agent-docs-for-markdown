import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQL_WASM_DIR = path.resolve(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist');
const SCHEMA_VERSION = 1;

let sqlRuntimePromise = null;

export async function loadSqlRuntime() {
  if (!sqlRuntimePromise) {
    sqlRuntimePromise = initSqlJs({
      locateFile: (file) => path.join(SQL_WASM_DIR, file),
    });
  }
  return sqlRuntimePromise;
}

export async function writeSourceGraphSqlite(dbPath, graphDb) {
  await withSqliteWriteLock(dbPath, async () => {
    const SQL = await loadSqlRuntime();
    const sqlite = new SQL.Database();
    try {
      configureWritePragmas(sqlite);
      createSchema(sqlite, { indexes: false });
      replaceGraphDb(sqlite, graphDb);
      createIndexes(sqlite);
      await writeSqliteDatabaseAtomic(dbPath, sqlite);
    } finally {
      sqlite.close();
    }
  });
}

export async function patchSourceGraphSqlite(dbPath, graphDb, changedDocumentIds = []) {
  const ids = [...new Set(changedDocumentIds.filter(Boolean))];
  if (!ids.length) {
    await writeSourceGraphSqlite(dbPath, graphDb);
    return;
  }
  await withSqliteWriteLock(dbPath, async () => {
    const SQL = await loadSqlRuntime();
    const bytes = await fs.readFile(dbPath);
    const sqlite = new SQL.Database(bytes);
    try {
      configureWritePragmas(sqlite);
      createSchema(sqlite);
      patchGraphDb(sqlite, graphDb, ids);
      await writeSqliteDatabaseAtomic(dbPath, sqlite);
    } finally {
      sqlite.close();
    }
  });
}

export async function readSourceGraphSqlite(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return readGraphDb(sqlite);
  } finally {
    sqlite.close();
  }
}

export async function readSourceGraphIncrementalSqlite(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return readGraphDb(sqlite, { incrementalOnly: true });
  } finally {
    sqlite.close();
  }
}

export async function readSourceGraphAuditSqlite(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return readGraphDb(sqlite, { auditOnly: true });
  } finally {
    sqlite.close();
  }
}

export async function readSourceGraphWebviewSqlite(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return readGraphDb(sqlite, { webviewOnly: true });
  } finally {
    sqlite.close();
  }
}

export async function sourceGraphSqliteSummary(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return {
      updatedAt: getMeta(sqlite, 'updatedAt'),
      root: getMeta(sqlite, 'root'),
      documents: scalar(sqlite, 'SELECT COUNT(*) FROM documents'),
      headings: scalar(sqlite, 'SELECT COUNT(*) FROM headings'),
      links: scalar(sqlite, 'SELECT COUNT(*) FROM links'),
      unresolvedInternalLinks: scalar(sqlite, "SELECT COUNT(*) FROM links WHERE type NOT IN ('url', 'image') AND status NOT IN ('resolved', 'resolved-by-name', 'external')"),
      orphanDocuments: scalar(sqlite, 'SELECT COUNT(*) FROM documents WHERE incoming_count = 0'),
      graphNodes: scalar(sqlite, 'SELECT COUNT(*) FROM graph_nodes'),
      graphEdges: scalar(sqlite, 'SELECT COUNT(*) FROM graph_edges'),
    };
  } finally {
    sqlite.close();
  }
}

export async function readSourceGraphChangeMetadataSqlite(dbPath) {
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return {
      updatedAt: getMeta(sqlite, 'updatedAt'),
      root: getMeta(sqlite, 'root'),
      tables: {
        documents: queryRows(sqlite, 'SELECT path, source_hash, mtime_ms, size FROM documents ORDER BY path').map((row) => ({
          path: row.path,
          sourceHash: row.source_hash || '',
          mtimeMs: row.mtime_ms,
          size: row.size,
        })),
      },
    };
  } finally {
    sqlite.close();
  }
}

export async function searchSourceGraphSqlite(dbPath, query = '', options = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const SQL = await loadSqlRuntime();
  const bytes = await fs.readFile(dbPath);
  const sqlite = new SQL.Database(bytes);
  try {
    return searchGraphRows(sqlite, terms, { ...options, phrase: normalizedQuery });
  } finally {
    sqlite.close();
  }
}

function configureWritePragmas(sqlite) {
  sqlite.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
  `);
}

async function withSqliteWriteLock(dbPath, worker) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const lockPath = `${dbPath}.lock`;
  const startedAt = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt > 120_000) {
        throw new Error(`Timed out waiting for Source Graph SQLite write lock: ${lockPath}`);
      }
      await delay(150);
    }
  }
  try {
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
    return await worker();
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}

async function writeSqliteDatabaseAtomic(dbPath, sqlite) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const tempPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, Buffer.from(sqlite.export()));
  try {
    await fs.rename(tempPath, dbPath);
  } catch (error) {
    if (process.platform !== 'win32' || !['EEXIST', 'EPERM', 'EACCES'].includes(error?.code)) {
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
    await fs.unlink(dbPath).catch(() => {});
    await fs.rename(tempPath, dbPath);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSchema(sqlite, options = {}) {
  sqlite.exec(`
    PRAGMA user_version = ${SCHEMA_VERSION};
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_hash TEXT NOT NULL DEFAULT '',
      mtime_ms REAL NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      line_count INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0,
      heading_count INTEGER NOT NULL DEFAULT 0,
      outgoing_count INTEGER NOT NULL DEFAULT 0,
      incoming_count INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS headings (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      depth INTEGER NOT NULL,
      line INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      source_document_id TEXT NOT NULL,
      target_document_id TEXT NOT NULL DEFAULT '',
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL DEFAULT '',
      href TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      line INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT '',
      anchor TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS citations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      link_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      href TEXT NOT NULL DEFAULT '',
      line INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS search_index (
      document_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      blob_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS search_blobs (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 1,
      incoming_count INTEGER NOT NULL DEFAULT 0,
      outgoing_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      line INTEGER NOT NULL DEFAULT 1
    );
  `);
  ensureColumn(sqlite, 'documents', 'source_hash', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sqlite, 'search_index', 'blob_id', "TEXT NOT NULL DEFAULT ''");
  if (options.indexes !== false) createIndexes(sqlite);
}

function createIndexes(sqlite) {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
    CREATE INDEX IF NOT EXISTS idx_headings_document ON headings(document_id);
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_document_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_document_id);
    CREATE INDEX IF NOT EXISTS idx_search_path ON search_index(path);
    CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target);
  `);
}

function replaceGraphDb(sqlite, graphDb) {
  sqlite.exec(`
    BEGIN;
    DELETE FROM meta;
    DELETE FROM documents;
    DELETE FROM headings;
    DELETE FROM links;
    DELETE FROM citations;
    DELETE FROM search_index;
    DELETE FROM search_blobs;
    DELETE FROM graph_nodes;
    DELETE FROM graph_edges;
  `);
  try {
    insertMeta(sqlite, 'schemaVersion', String(graphDb.schemaVersion || SCHEMA_VERSION));
    insertMeta(sqlite, 'kind', String(graphDb.kind || 'markdown-agent-docs.source-graph'));
    insertMeta(sqlite, 'updatedAt', String(graphDb.updatedAt || new Date().toISOString()));
    insertMeta(sqlite, 'root', String(graphDb.root || ''));

    insertRows(sqlite, 'documents', [
      'id', 'path', 'title', 'source_hash', 'mtime_ms', 'size', 'line_count', 'word_count', 'heading_count', 'outgoing_count', 'incoming_count', 'snippet',
    ], (graphDb.tables?.documents || []).map((doc) => [
      doc.id, doc.path, doc.title, doc.sourceHash || '', doc.mtimeMs, doc.size, doc.lineCount, doc.wordCount, doc.headingCount, doc.outgoingCount, doc.incomingCount, doc.snippet,
    ]));
    insertRows(sqlite, 'headings', ['id', 'document_id', 'slug', 'title', 'depth', 'line'], (graphDb.tables?.headings || []).map((row) => [
      row.id, row.documentId, row.slug, row.title, row.depth, row.line,
    ]));
    insertRows(sqlite, 'links', [
      'id', 'source_document_id', 'target_document_id', 'source_path', 'target_path', 'href', 'label', 'type', 'line', 'status', 'anchor',
    ], (graphDb.tables?.links || []).map((row) => [
      row.id, row.sourceDocumentId, row.targetDocumentId, row.sourcePath, row.targetPath, row.href, row.label, row.type, row.line, row.status, row.anchor,
    ]));
    insertRows(sqlite, 'citations', ['id', 'document_id', 'link_id', 'label', 'href', 'line', 'status'], (graphDb.tables?.citations || []).map((row) => [
      row.id, row.documentId, row.linkId, row.label, row.href, row.line, row.status,
    ]));
    insertSearchRows(sqlite, graphDb.tables?.searchIndex || []);
    insertRows(sqlite, 'graph_nodes', ['id', 'path', 'label', 'title', 'kind', 'weight', 'incoming_count', 'outgoing_count'], (graphDb.graph?.nodes || []).map((row) => [
      row.id, row.path, row.label, row.title, row.kind, row.weight, row.incomingCount, row.outgoingCount,
    ]));
    insertRows(sqlite, 'graph_edges', ['id', 'source', 'target', 'label', 'type', 'status', 'line'], (graphDb.graph?.edges || []).map((row) => [
      row.id, row.source, row.target, row.label, row.type, row.status, row.line,
    ]));
    sqlite.exec('COMMIT;');
  } catch (error) {
    sqlite.exec('ROLLBACK;');
    throw error;
  }
}

function patchGraphDb(sqlite, graphDb, changedDocumentIds) {
  sqlite.exec('BEGIN;');
  try {
    sqlite.exec('DELETE FROM meta;');
    insertMeta(sqlite, 'schemaVersion', String(graphDb.schemaVersion || SCHEMA_VERSION));
    insertMeta(sqlite, 'kind', String(graphDb.kind || 'markdown-agent-docs.source-graph'));
    insertMeta(sqlite, 'updatedAt', String(graphDb.updatedAt || new Date().toISOString()));
    insertMeta(sqlite, 'root', String(graphDb.root || ''));

    deleteRowsIn(sqlite, 'headings', 'document_id', changedDocumentIds);
    deleteRowsIn(sqlite, 'search_index', 'document_id', changedDocumentIds);
    deleteRowsIn(sqlite, 'links', 'source_document_id', changedDocumentIds);
    deleteRowsIn(sqlite, 'citations', 'document_id', changedDocumentIds);
    sqlite.exec('DELETE FROM graph_nodes; DELETE FROM graph_edges;');

    insertRows(sqlite, 'documents', [
      'id', 'path', 'title', 'source_hash', 'mtime_ms', 'size', 'line_count', 'word_count', 'heading_count', 'outgoing_count', 'incoming_count', 'snippet',
    ], (graphDb.tables?.documents || []).map((doc) => [
      doc.id, doc.path, doc.title, doc.sourceHash || '', doc.mtimeMs, doc.size, doc.lineCount, doc.wordCount, doc.headingCount, doc.outgoingCount, doc.incomingCount, doc.snippet,
    ]), { replace: true });
    insertRows(sqlite, 'headings', ['id', 'document_id', 'slug', 'title', 'depth', 'line'], (graphDb.tables?.headings || [])
      .filter((row) => changedDocumentIds.includes(row.documentId))
      .map((row) => [row.id, row.documentId, row.slug, row.title, row.depth, row.line]));
    insertRows(sqlite, 'links', [
      'id', 'source_document_id', 'target_document_id', 'source_path', 'target_path', 'href', 'label', 'type', 'line', 'status', 'anchor',
    ], (graphDb.tables?.links || [])
      .filter((row) => changedDocumentIds.includes(row.sourceDocumentId))
      .map((row) => [row.id, row.sourceDocumentId, row.targetDocumentId, row.sourcePath, row.targetPath, row.href, row.label, row.type, row.line, row.status, row.anchor]));
    insertRows(sqlite, 'citations', ['id', 'document_id', 'link_id', 'label', 'href', 'line', 'status'], (graphDb.tables?.citations || [])
      .filter((row) => changedDocumentIds.includes(row.documentId))
      .map((row) => [row.id, row.documentId, row.linkId, row.label, row.href, row.line, row.status]));
    insertSearchRows(sqlite, (graphDb.tables?.searchIndex || [])
      .filter((row) => changedDocumentIds.includes(row.documentId)));
    insertRows(sqlite, 'graph_nodes', ['id', 'path', 'label', 'title', 'kind', 'weight', 'incoming_count', 'outgoing_count'], (graphDb.graph?.nodes || []).map((row) => [
      row.id, row.path, row.label, row.title, row.kind, row.weight, row.incomingCount, row.outgoingCount,
    ]));
    insertRows(sqlite, 'graph_edges', ['id', 'source', 'target', 'label', 'type', 'status', 'line'], (graphDb.graph?.edges || []).map((row) => [
      row.id, row.source, row.target, row.label, row.type, row.status, row.line,
    ]));
    sqlite.exec('COMMIT;');
  } catch (error) {
    sqlite.exec('ROLLBACK;');
    throw error;
  }
}

function readGraphDb(sqlite, options = {}) {
  const documents = queryRows(sqlite, 'SELECT * FROM documents ORDER BY path').map((row) => ({
    id: row.id,
    path: row.path,
    title: row.title,
    sourceHash: row.source_hash || '',
    mtimeMs: row.mtime_ms,
    size: row.size,
    lineCount: row.line_count,
    wordCount: row.word_count,
    headingCount: row.heading_count,
    outgoingCount: row.outgoing_count,
    incomingCount: row.incoming_count,
    snippet: row.snippet,
  }));
  const links = queryRows(sqlite, 'SELECT * FROM links ORDER BY source_path, line, id').map((row) => ({
    id: row.id,
    sourceDocumentId: row.source_document_id,
    targetDocumentId: row.target_document_id,
    sourcePath: row.source_path,
    targetPath: row.target_path,
    href: row.href,
    label: row.label,
    type: row.type,
    line: row.line,
    status: row.status,
    anchor: row.anchor,
  }));
  const graph = options.auditOnly || options.incrementalOnly
    ? { nodes: [], edges: [] }
    : {
        nodes: queryRows(sqlite, 'SELECT * FROM graph_nodes ORDER BY id').map((row) => ({
          id: row.id,
          path: row.path,
          label: row.label,
          title: row.title,
          kind: row.kind,
          weight: row.weight,
          incomingCount: row.incoming_count,
          outgoingCount: row.outgoing_count,
        })),
        edges: queryRows(sqlite, 'SELECT * FROM graph_edges ORDER BY id').map((row) => ({
          id: row.id,
          source: row.source,
          target: row.target,
          label: row.label,
          type: row.type,
          status: row.status,
          line: row.line,
        })),
      };
  if (options.webviewOnly) {
    return {
      schemaVersion: Number(getMeta(sqlite, 'schemaVersion') || SCHEMA_VERSION),
      kind: getMeta(sqlite, 'kind') || 'markdown-agent-docs.source-graph',
      updatedAt: getMeta(sqlite, 'updatedAt') || new Date().toISOString(),
      root: getMeta(sqlite, 'root') || '',
      tables: {
        documents,
        headings: [],
        links,
        citations: [],
        searchIndex: [],
      },
      graph,
    };
  }
  return {
    schemaVersion: Number(getMeta(sqlite, 'schemaVersion') || SCHEMA_VERSION),
    kind: getMeta(sqlite, 'kind') || 'markdown-agent-docs.source-graph',
    updatedAt: getMeta(sqlite, 'updatedAt') || new Date().toISOString(),
      root: getMeta(sqlite, 'root') || '',
      tables: {
        documents,
      headings: options.incrementalOnly || options.auditOnly ? [] : queryRows(sqlite, 'SELECT * FROM headings ORDER BY document_id, line').map((row) => ({
          id: row.id,
          documentId: row.document_id,
          slug: row.slug,
          title: row.title,
          depth: row.depth,
          line: row.line,
        })),
      links,
      citations: options.auditOnly ? [] : queryRows(sqlite, 'SELECT * FROM citations ORDER BY document_id, line').map((row) => ({
          id: row.id,
          documentId: row.document_id,
          linkId: row.link_id,
          label: row.label,
          href: row.href,
          line: row.line,
          status: row.status,
        })),
      searchIndex: options.incrementalOnly || options.auditOnly ? [] : queryRows(sqlite, `
          SELECT s.document_id, s.path, s.title, COALESCE(NULLIF(s.text, ''), b.text, '') AS text
          FROM search_index s
          LEFT JOIN search_blobs b ON b.id = s.blob_id
          ORDER BY s.path
        `).map((row) => ({
          documentId: row.document_id,
          path: row.path,
          title: row.title,
          text: row.text,
        })),
    },
    graph,
  };
}

function insertMeta(sqlite, key, value) {
  const statement = sqlite.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  try {
    statement.run([key, value]);
  } finally {
    statement.free();
  }
}

function insertRows(sqlite, table, columns, rows, options = {}) {
  if (!rows.length) return;
  const placeholders = columns.map(() => '?').join(', ');
  const verb = options.replace ? 'INSERT OR REPLACE' : 'INSERT';
  const statement = sqlite.prepare(`${verb} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  try {
    for (const row of rows) statement.run(row.map(normalizeValue));
  } finally {
    statement.free();
  }
}

function insertSearchRows(sqlite, rows) {
  if (!rows.length) return;
  const blobs = new Map();
  const indexRows = [];
  for (const row of rows) {
    const text = String(row.text || '');
    const blobId = `sha1:${crypto.createHash('sha1').update(text).digest('hex')}`;
    if (!blobs.has(blobId)) blobs.set(blobId, text);
    indexRows.push([row.documentId, row.path, row.title, '', blobId]);
  }
  insertRows(sqlite, 'search_blobs', ['id', 'text'], [...blobs.entries()], { replace: true });
  insertRows(sqlite, 'search_index', ['document_id', 'path', 'title', 'text', 'blob_id'], indexRows);
}

function deleteRowsIn(sqlite, table, column, values) {
  if (!values.length) return;
  const placeholders = values.map(() => '?').join(', ');
  const statement = sqlite.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`);
  try {
    statement.run(values);
  } finally {
    statement.free();
  }
}

function ensureColumn(sqlite, table, column, definition) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  } catch {
    // Existing databases already have this column.
  }
}

function queryRows(sqlite, sql, params = []) {
  const statement = sqlite.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function scalar(sqlite, sql, params = []) {
  const row = queryRows(sqlite, sql, params)[0];
  if (!row) return 0;
  return Number(Object.values(row)[0] || 0);
}

function getMeta(sqlite, key) {
  const row = queryRows(sqlite, 'SELECT value FROM meta WHERE key = ?', [key])[0];
  return row?.value || '';
}

function searchGraphRows(sqlite, terms, options = {}) {
  const mode = options.mode === 'file' ? 'file' : 'body';
  const limit = clampLimit(options.limit, 20);
  const textExpression = "COALESCE(NULLIF(s.text, ''), b.text, '')";
  const scoreParts = [];
  const whereParts = [];
  const scoreParams = [];
  const whereParams = [];
  const phrase = String(options.phrase || '').trim();
  if (phrase && phrase.includes(' ')) {
    const phraseLike = `%${phrase}%`;
    scoreParts.push('CASE WHEN lower(s.title) LIKE ? THEN ? ELSE 0 END');
    scoreParams.push(phraseLike, mode === 'body' ? 80 : 100);
    scoreParts.push('CASE WHEN lower(s.path) LIKE ? THEN ? ELSE 0 END');
    scoreParams.push(phraseLike, mode === 'body' ? 60 : 80);
    if (mode === 'body') {
      scoreParts.push(`CASE WHEN ${textExpression} LIKE ? THEN 48 ELSE 0 END`);
      scoreParams.push(phraseLike);
    }
  }
  for (const term of terms) {
    const like = `%${term}%`;
    scoreParts.push('CASE WHEN lower(s.title) LIKE ? THEN ? ELSE 0 END');
    scoreParams.push(like, mode === 'body' ? 8 : 10);
    scoreParts.push('CASE WHEN lower(s.path) LIKE ? THEN ? ELSE 0 END');
    scoreParams.push(like, mode === 'body' ? 5 : 9);
    if (mode === 'body') {
      scoreParts.push(`CASE WHEN ${textExpression} LIKE ? THEN 1 ELSE 0 END`);
      scoreParams.push(like);
      whereParts.push(`(lower(s.title) LIKE ? OR lower(s.path) LIKE ? OR ${textExpression} LIKE ?)`);
      whereParams.push(like, like, like);
    } else {
      whereParts.push('(lower(s.title) LIKE ? OR lower(s.path) LIKE ?)');
      whereParams.push(like, like);
    }
  }
  const params = [...scoreParams, ...whereParams];
  params.push(Math.max(limit * 4, limit));
  const scopeWhere = options.excludeSkillCopies === true
    ? ` AND ${skillCopyExclusionSql('d.path')}`
    : '';
  const rows = queryRows(sqlite, `
    SELECT
      d.id,
      d.path,
      d.title,
      d.mtime_ms,
      d.size,
      d.line_count,
      d.word_count,
      d.heading_count,
      d.outgoing_count,
      d.incoming_count,
      d.snippet,
      (${scoreParts.join(' + ')}) AS score
    FROM search_index s
    LEFT JOIN search_blobs b ON b.id = s.blob_id
    JOIN documents d ON d.id = s.document_id
    WHERE (${whereParts.join(' OR ')})${scopeWhere}
    ORDER BY score DESC, d.path ASC
    LIMIT ?
  `, params);
  return rows
    .map((row) => ({
      id: row.id,
      path: row.path,
      title: row.title,
      mtimeMs: row.mtime_ms,
      size: row.size,
      lineCount: row.line_count,
      wordCount: row.word_count,
      headingCount: row.heading_count,
      outgoingCount: row.outgoing_count,
      incomingCount: row.incoming_count,
      snippet: row.snippet,
      score: Number(row.score || 0),
    }))
    .filter((row) => row.score > 0)
    .sort(compareSearchRows)
    .slice(0, limit);
}

function compareSearchRows(a, b) {
  const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDelta) return scoreDelta;
  const priorityDelta = searchPathPriority(b.path) - searchPathPriority(a.path);
  if (priorityDelta) return priorityDelta;
  return String(a.path || '').localeCompare(String(b.path || ''));
}

function searchPathPriority(value = '') {
  const normalizedPath = String(value || '').replace(/\\/g, '/');
  if (normalizedPath === 'README.md') return 80;
  if (/^README(?:\.[^.]+)?\.md$/i.test(normalizedPath)) return 75;
  if (/^(?:vscode-extension\/)?(?:\.codex|\.agents|\.claude|\.gemini|\.cursor|ai_skills\/[^/]+)\/skills\//.test(normalizedPath)) return 20;
  if (!normalizedPath.includes('/') && !normalizedPath.startsWith('.')) return 70;
  if (!normalizedPath.startsWith('.')) return 50;
  return 30;
}

function skillCopyExclusionSql(column) {
  const target = `lower(${column})`;
  return `NOT (
    ${target} LIKE '.codex/skills/%'
    OR ${target} LIKE '.agents/skills/%'
    OR ${target} LIKE '.claude/skills/%'
    OR ${target} LIKE '.gemini/skills/%'
    OR ${target} LIKE '.cursor/skills/%'
    OR ${target} LIKE 'ai_skills/%/skills/%'
    OR ${target} LIKE 'vscode-extension/ai_skills/%/skills/%'
  )`;
}

function normalizeSearchQuery(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}._/-]+/gu, ' ').trim();
}

function clampLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}
