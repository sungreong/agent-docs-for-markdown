import fs from 'node:fs/promises';
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
  const SQL = await loadSqlRuntime();
  const sqlite = new SQL.Database();
  try {
    createSchema(sqlite);
    replaceGraphDb(sqlite, graphDb);
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, Buffer.from(sqlite.export()));
  } finally {
    sqlite.close();
  }
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
      graphNodes: scalar(sqlite, 'SELECT COUNT(*) FROM graph_nodes'),
      graphEdges: scalar(sqlite, 'SELECT COUNT(*) FROM graph_edges'),
    };
  } finally {
    sqlite.close();
  }
}

function createSchema(sqlite) {
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
    DELETE FROM graph_nodes;
    DELETE FROM graph_edges;
  `);
  try {
    insertMeta(sqlite, 'schemaVersion', String(graphDb.schemaVersion || SCHEMA_VERSION));
    insertMeta(sqlite, 'kind', String(graphDb.kind || 'markdown-agent-docs.source-graph'));
    insertMeta(sqlite, 'updatedAt', String(graphDb.updatedAt || new Date().toISOString()));
    insertMeta(sqlite, 'root', String(graphDb.root || ''));

    insertRows(sqlite, 'documents', [
      'id', 'path', 'title', 'mtime_ms', 'size', 'line_count', 'word_count', 'heading_count', 'outgoing_count', 'incoming_count', 'snippet',
    ], (graphDb.tables?.documents || []).map((doc) => [
      doc.id, doc.path, doc.title, doc.mtimeMs, doc.size, doc.lineCount, doc.wordCount, doc.headingCount, doc.outgoingCount, doc.incomingCount, doc.snippet,
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
    insertRows(sqlite, 'search_index', ['document_id', 'path', 'title', 'text'], (graphDb.tables?.searchIndex || []).map((row) => [
      row.documentId, row.path, row.title, row.text,
    ]));
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
  const graph = {
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
      headings: queryRows(sqlite, 'SELECT * FROM headings ORDER BY document_id, line').map((row) => ({
        id: row.id,
        documentId: row.document_id,
        slug: row.slug,
        title: row.title,
        depth: row.depth,
        line: row.line,
      })),
      links,
      citations: queryRows(sqlite, 'SELECT * FROM citations ORDER BY document_id, line').map((row) => ({
        id: row.id,
        documentId: row.document_id,
        linkId: row.link_id,
        label: row.label,
        href: row.href,
        line: row.line,
        status: row.status,
      })),
      searchIndex: queryRows(sqlite, 'SELECT * FROM search_index ORDER BY path').map((row) => ({
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

function insertRows(sqlite, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = columns.map(() => '?').join(', ');
  const statement = sqlite.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
  try {
    for (const row of rows) statement.run(row.map(normalizeValue));
  } finally {
    statement.free();
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

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}
