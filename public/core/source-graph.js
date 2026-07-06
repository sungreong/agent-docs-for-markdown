const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.markdown', '.mdown', '.mkd', '.mkdn'];
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const REFERENCE_LINK_RE = /(!?)\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
const REFERENCE_DEF_RE = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+["'(](.+?)["')])?\s*$/;
const WIKI_LINK_RE = /!\[\[([^\]\n]+)\]\]|\[\[([^\]\n]+)\]\]/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

export function buildSourceGraphIndex(documents = [], options = {}) {
  const now = options.updatedAt || new Date().toISOString();
  const parseCache = new Map();
  const normalizedDocuments = documents
    .filter((doc) => doc && typeof doc.source === 'string')
    .map((doc, index) => normalizeDocument(doc, index));
  const pathLookup = createPathLookup(normalizedDocuments);
  const db = {
    schemaVersion: 1,
    kind: 'markdown-agent-docs.source-graph',
    updatedAt: now,
    root: options.root || '',
    tables: {
      documents: [],
      headings: [],
      links: [],
      citations: [],
      searchIndex: [],
    },
    graph: {
      nodes: [],
      edges: [],
    },
  };

  for (const doc of normalizedDocuments) {
    appendParsedDocumentRows(db, doc, pathLookup, parseCache);
  }

  finalizeSourceGraphDb(db, options);
  return db;
}

export function updateSourceGraphDocuments(db, documents = [], options = {}) {
  const parseCache = new Map();
  const normalizedDocuments = documents
    .filter((doc) => doc && typeof doc.source === 'string')
    .map((doc, index) => normalizeDocument(doc, index));
  if (!normalizedDocuments.length) return db;

  const next = cloneGraphDb(db);
  next.updatedAt = options.updatedAt || new Date().toISOString();
  if (options.root) next.root = options.root;

  const changedIds = new Set(normalizedDocuments.map((doc) => doc.id));
  next.tables.documents = (next.tables.documents || []).filter((doc) => !changedIds.has(doc.id));
  next.tables.headings = (next.tables.headings || []).filter((heading) => !changedIds.has(heading.documentId));
  next.tables.searchIndex = (next.tables.searchIndex || []).filter((entry) => !changedIds.has(entry.documentId));
  next.tables.links = (next.tables.links || []).filter((link) => !changedIds.has(link.sourceDocumentId));
  next.tables.citations = (next.tables.citations || []).filter((citation) => !changedIds.has(citation.documentId));

  const pathLookup = createPathLookup([...next.tables.documents, ...normalizedDocuments]);
  for (const doc of normalizedDocuments) {
    appendParsedDocumentRows(next, doc, pathLookup, parseCache);
  }
  next.tables.documents.sort((a, b) => a.path.localeCompare(b.path));
  next.tables.headings.sort((a, b) => a.documentId.localeCompare(b.documentId) || a.line - b.line);
  next.tables.searchIndex.sort((a, b) => a.path.localeCompare(b.path));
  finalizeSourceGraphDb(next, options);
  return next;
}

function appendParsedDocumentRows(db, doc, pathLookup, parseCache = new Map()) {
  const parsed = parseDocumentCached(doc, parseCache);
  let nextLinkIndex = nextNumericId(db.tables.links, 'link');
  let nextCitationIndex = nextNumericId(db.tables.citations, 'citation');
  db.tables.documents.push({
    id: doc.id,
    path: doc.path,
    title: parsed.title,
    mtimeMs: doc.mtimeMs || 0,
    size: doc.size || doc.source.length,
    sourceHash: doc.sourceHash || hashSourceGraphSource(doc.source),
    lineCount: parsed.lineCount,
    wordCount: parsed.wordCount,
    headingCount: parsed.headings.length,
    outgoingCount: 0,
    incomingCount: 0,
    snippet: parsed.snippet,
  });
  db.tables.headings.push(...parsed.headings.map((heading) => ({ ...heading, documentId: doc.id })));
  db.tables.searchIndex.push({
    documentId: doc.id,
    path: doc.path,
    title: parsed.title,
    text: parsed.searchText,
  });

  for (const link of parsed.links) {
    const resolved = resolveLinkTarget(link.href, doc.path, pathLookup);
    const targetDocumentId = resolved.documentId || '';
    const targetPath = resolved.path || '';
    const record = {
      id: `link:${nextLinkIndex++}`,
      sourceDocumentId: doc.id,
      targetDocumentId,
      sourcePath: doc.path,
      targetPath,
      href: link.href,
      label: link.label,
      type: link.type,
      line: link.line,
      status: resolved.status,
      anchor: resolved.anchor || '',
    };
    db.tables.links.push(record);
    if (link.type === 'reference' || link.type === 'wiki' || link.type === 'image' || link.type === 'url') {
      db.tables.citations.push({
        id: `citation:${nextCitationIndex++}`,
        documentId: doc.id,
        linkId: record.id,
        label: link.label,
        href: link.href,
        line: link.line,
        status: resolved.status,
      });
    }
  }
}

function finalizeSourceGraphDb(db, options = {}) {
  const documentById = new Map(db.tables.documents.map((doc) => [doc.id, doc]));
  for (const doc of documentById.values()) {
    doc.outgoingCount = 0;
    doc.incomingCount = 0;
  }
  for (const link of db.tables.links) {
    const source = documentById.get(link.sourceDocumentId);
    if (source) source.outgoingCount += 1;
    const target = documentById.get(link.targetDocumentId);
    if (target) target.incomingCount += 1;
  }

  const externalNodes = new Map();
  db.graph.edges = [];
  db.graph.nodes = db.tables.documents.map((doc) => ({
    id: doc.id,
    path: doc.path,
    label: doc.title || basename(doc.path),
    title: doc.title,
    kind: 'document',
    weight: 1 + doc.incomingCount + doc.outgoingCount,
    incomingCount: doc.incomingCount,
    outgoingCount: doc.outgoingCount,
  }));

  for (const link of db.tables.links) {
    let targetId = link.targetDocumentId;
    if (!targetId && options.includeExternal !== false) {
      targetId = `external:${link.href}`;
      if (!externalNodes.has(targetId)) {
        externalNodes.set(targetId, {
          id: targetId,
          path: link.href,
          label: compactLabel(link.label || link.href),
          title: link.href,
          kind: link.status === 'external' ? 'external' : 'unresolved',
          weight: 1,
          incomingCount: 1,
          outgoingCount: 0,
        });
      } else {
        externalNodes.get(targetId).incomingCount += 1;
        externalNodes.get(targetId).weight += 1;
      }
    }
    if (targetId) {
      db.graph.edges.push({
        id: `edge:${db.graph.edges.length + 1}`,
        source: link.sourceDocumentId,
        target: targetId,
        label: link.label,
        type: link.type,
        status: link.status,
        line: link.line,
      });
    }
  }
  db.graph.nodes.push(...externalNodes.values());
}

export function searchSourceGraph(db, query = '', limit = 20) {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const documents = new Map((db?.tables?.documents || []).map((doc) => [doc.id, doc]));
  return (db?.tables?.searchIndex || [])
    .map((entry) => {
      let score = 0;
      if (normalizedQuery.includes(' ')) {
        if (entry.title.toLowerCase().includes(normalizedQuery)) score += 80;
        if (entry.path.toLowerCase().includes(normalizedQuery)) score += 60;
        if (entry.text.includes(normalizedQuery)) score += 48;
      }
      for (const term of terms) {
        if (entry.title.toLowerCase().includes(term)) score += 8;
        if (entry.path.toLowerCase().includes(term)) score += 5;
        if (entry.text.includes(term)) score += 1;
      }
      return { score, document: documents.get(entry.documentId) };
    })
    .filter((item) => item.score > 0 && item.document)
    .sort(compareSearchMatches)
    .slice(0, limit)
    .map((item) => ({ ...item.document, score: item.score }));
}

function compareSearchMatches(a, b) {
  const scoreDelta = b.score - a.score;
  if (scoreDelta) return scoreDelta;
  const priorityDelta = sourceGraphSearchPathPriority(b.document?.path) - sourceGraphSearchPathPriority(a.document?.path);
  if (priorityDelta) return priorityDelta;
  return String(a.document?.path || '').localeCompare(String(b.document?.path || ''));
}

function sourceGraphSearchPathPriority(value = '') {
  const normalizedPath = String(value || '').replace(/\\/g, '/');
  if (normalizedPath === 'README.md') return 80;
  if (/^README(?:\.[^.]+)?\.md$/i.test(normalizedPath)) return 75;
  if (isBundledSkillPath(normalizedPath)) return 20;
  if (!normalizedPath.includes('/') && !normalizedPath.startsWith('.')) return 70;
  if (!normalizedPath.startsWith('.')) return 50;
  return 30;
}

function isBundledSkillPath(normalizedPath = '') {
  return /^(?:vscode-extension\/)?(?:\.codex|\.agents|\.claude|\.gemini|\.cursor|ai_skills\/[^/]+)\/skills\//.test(normalizedPath);
}

export function getSourceGraphNeighbors(db, pathOrId = '', depth = 1) {
  const start = resolveDocumentId(db, pathOrId);
  if (!start) return { documents: [], links: [] };
  const maxDepth = Math.max(1, Math.min(4, Number(depth) || 1));
  const visited = new Set([start]);
  let frontier = new Set([start]);
  const links = [];
  for (let level = 0; level < maxDepth; level += 1) {
    const next = new Set();
    for (const link of db.tables.links || []) {
      const touchesSource = frontier.has(link.sourceDocumentId);
      const touchesTarget = link.targetDocumentId && frontier.has(link.targetDocumentId);
      if (!touchesSource && !touchesTarget) continue;
      links.push(link);
      for (const id of [link.sourceDocumentId, link.targetDocumentId]) {
        if (!id || visited.has(id)) continue;
        visited.add(id);
        next.add(id);
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  const docs = new Map((db.tables.documents || []).map((doc) => [doc.id, doc]));
  return {
    documents: [...visited].map((id) => docs.get(id)).filter(Boolean),
    links: uniqueBy(links, (link) => link.id),
  };
}

export function hashSourceGraphSource(value = '') {
  const text = String(value || '');
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `cyrb53:${text.length}:${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

function parseDocumentCached(doc, cache) {
  const source = String(doc.source || '');
  const cached = cache.get(source);
  if (cached) {
    return {
      ...cached,
      headings: cached.headings.map((heading, index) => ({
        ...heading,
        id: `${doc.id}:heading:${index + 1}`,
      })),
      links: cached.links.map((link) => ({ ...link })),
    };
  }
  const parsed = parseDocument(doc);
  const reusable = {
    ...parsed,
    headings: parsed.headings.map((heading) => ({
      slug: heading.slug,
      title: heading.title,
      depth: heading.depth,
      line: heading.line,
    })),
    links: parsed.links.map((link) => ({ ...link })),
  };
  cache.set(source, reusable);
  return parsed;
}

function parseDocument(doc) {
  const normalizedSource = doc.source.includes('\r') ? doc.source.replace(/\r\n?/g, '\n') : doc.source;
  const lines = normalizedSource.split('\n');
  const referenceDefs = new Map();
  const headings = [];
  const links = [];
  let title = '';

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const rawTitle = stripHeadingAttrs(headingMatch[2]).trim() || 'Untitled';
      if (!title && depth <= 2) title = rawTitle;
      headings.push({
        id: `${doc.id}:heading:${headings.length + 1}`,
        slug: slugify(rawTitle),
        title: rawTitle,
        depth,
        line: lineNumber,
      });
    }
    const defMatch = line.match(REFERENCE_DEF_RE);
    if (defMatch) {
      referenceDefs.set(normalizeReferenceLabel(defMatch[1]), {
        href: defMatch[2],
        title: defMatch[3] || '',
        line: lineNumber,
      });
    }
  });

  if (!title) title = deriveTitleFromFrontMatter(doc.source) || basename(doc.path);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    collectRegexLinks(line, MARKDOWN_LINK_RE, lineNumber, links, (match) => ({
      type: match[1] ? 'image' : linkType(match[3]),
      label: match[2],
      href: cleanHref(match[3]),
    }));
    collectRegexLinks(line, REFERENCE_LINK_RE, lineNumber, links, (match) => {
      const label = match[2];
      const key = normalizeReferenceLabel(match[3] || label);
      const ref = referenceDefs.get(key);
      if (!ref?.href) return null;
      return {
        type: match[1] ? 'image' : 'reference',
        label,
        href: cleanHref(ref.href),
      };
    });
    collectRegexLinks(line, WIKI_LINK_RE, lineNumber, links, (match) => {
      const body = match[1] || match[2] || '';
      const [target, label = target] = body.split('|').map((part) => part.trim());
      if (!target) return null;
      return {
        type: match[1] ? 'image' : 'wiki',
        label,
        href: cleanHref(target),
      };
    });
  });

  return {
    title,
    headings,
    links,
    lineCount: lines.length,
    wordCount: countWords(doc.source),
    snippet: buildSnippet(doc.source),
    searchText: normalizeSearchText(doc.source),
  };
}

function collectRegexLinks(line, regex, lineNumber, links, build) {
  regex.lastIndex = 0;
  for (const match of line.matchAll(regex)) {
    const link = build(match);
    if (!link?.href) continue;
    links.push({ ...link, line: lineNumber });
  }
}

function resolveLinkTarget(rawHref, sourcePath, pathLookup) {
  const href = cleanHref(rawHref);
  if (!href) return { status: 'empty' };
  if (href.startsWith('#')) return { status: 'local-anchor', documentId: pathLookup.find(sourcePath), path: sourcePath, anchor: href.slice(1) };
  if (href.startsWith('//') || URL_SCHEME_RE.test(href)) return { status: 'external' };
  const [withoutHash, anchor = ''] = href.split('#');
  const targetPath = normalizeRelativePath(sourcePath, withoutHash || sourcePath);
  const candidates = buildPathCandidates(targetPath);
  for (const candidate of candidates) {
    const resolved = pathLookup.resolve(candidate);
    if (resolved?.id) return { status: resolved.status, documentId: resolved.id, path: resolved.path, anchor };
  }
  return { status: 'unresolved', path: targetPath, anchor };
}

function buildPathCandidates(targetPath) {
  const normalized = normalizeSegments(targetPath);
  const decoded = decodePathText(normalized);
  const ext = extensionOf(normalized);
  const candidates = [normalized, decoded];
  if (!ext) {
    for (const markdownExt of MARKDOWN_EXTENSIONS) {
      candidates.push(`${normalized}${markdownExt}`);
      candidates.push(`${decoded}${markdownExt}`);
    }
    candidates.push(`${normalized}/index.md`);
    candidates.push(`${decoded}/index.md`);
  }
  return uniqueBy(candidates, (item) => item);
}

function normalizeRelativePath(sourcePath, rawTarget) {
  const target = cleanHref(rawTarget).replace(/^\.\//, '');
  if (!target) return sourcePath;
  if (target.startsWith('/')) return normalizeSegments(target.replace(/^\/+/, ''));
  const dir = sourcePath.includes('/') ? sourcePath.split('/').slice(0, -1).join('/') : '';
  return normalizeSegments(`${dir}/${target}`);
}

function normalizeDocument(doc, index) {
  const normalizedPath = normalizeSegments(String(doc.path || `document-${index + 1}.md`));
  const source = String(doc.source || '');
  return {
    id: stableDocumentId(normalizedPath),
    path: normalizedPath,
    source,
    sourceHash: String(doc.sourceHash || hashSourceGraphSource(source)),
    mtimeMs: Number(doc.mtimeMs || 0),
    size: Number(doc.size || 0),
  };
}

function createPathLookup(documents = []) {
  const byPath = new Map();
  for (const doc of documents) {
    const id = doc.id || stableDocumentId(doc.path || '');
    const normalizedPath = normalizeSegments(doc.path || '');
    if (!normalizedPath) continue;
    byPath.set(normalizedPath.toLowerCase(), { id, path: normalizedPath });
  }
  return {
    find(candidate) {
      return this.resolve(candidate)?.id || '';
    },
    resolve(candidate) {
      const normalized = normalizeSegments(candidate || '');
      const exact = byPath.get(normalized.toLowerCase());
      if (exact) return { ...exact, status: 'resolved' };
      const decoded = decodePathText(normalized);
      const decodedExact = byPath.get(decoded.toLowerCase());
      if (decodedExact) return { ...decodedExact, status: 'resolved' };
      return null;
    },
  };
}

function cloneGraphDb(db) {
  return JSON.parse(JSON.stringify(db || {
    schemaVersion: 1,
    kind: 'markdown-agent-docs.source-graph',
    updatedAt: new Date().toISOString(),
    root: '',
    tables: { documents: [], headings: [], links: [], citations: [], searchIndex: [] },
    graph: { nodes: [], edges: [] },
  }));
}

function stableDocumentId(filePath) {
  return `doc:${normalizeSegments(filePath).toLowerCase().replace(/[^a-z0-9가-힣._/-]+/gi, '-').replace(/[/.]+/g, ':')}`;
}

function resolveDocumentId(db, pathOrId) {
  const value = String(pathOrId || '').trim();
  if (!value) return '';
  if ((db.tables.documents || []).some((doc) => doc.id === value)) return value;
  const normalized = normalizeSegments(value).toLowerCase();
  return (db.tables.documents || []).find((doc) => doc.path.toLowerCase() === normalized)?.id || '';
}

function normalizeSegments(value) {
  const parts = String(value || '')
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '')
    .split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function cleanHref(value) {
  return String(value || '').trim().replace(/^<|>$/g, '').replace(/["'].*$/, '').trim();
}

function linkType(href) {
  if (/^https?:/i.test(href)) return 'url';
  return 'link';
}

function stripHeadingAttrs(value) {
  return String(value || '').replace(/\s*\{[^{}]*\}\s*$/, '');
}

function deriveTitleFromFrontMatter(source) {
  const match = String(source || '').match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const titleLine = match[1].split('\n').find((line) => /^title\s*:/i.test(line.trim()));
  if (!titleLine) return '';
  return titleLine.slice(titleLine.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
}

function basename(value) {
  const text = String(value || '').replace(/\\/g, '/');
  return text.split('/').pop() || text || 'Document';
}

function decodePathText(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function extensionOf(value) {
  const base = basename(value);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index).toLowerCase() : '';
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\u3131-\uD79D\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'section';
}

function countWords(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  let count = 0;
  let inWord = false;
  for (let index = 0; index < text.length; index += 1) {
    if (isWhitespaceCode(text.charCodeAt(index))) {
      inWord = false;
    } else if (!inWord) {
      count += 1;
      inWord = true;
    }
  }
  return count;
}

function isWhitespaceCode(code) {
  return code <= 32 || code === 160 || code === 5760 || code === 6158 || code === 8232 || code === 8233 || code === 8239 || code === 8287 || code === 12288;
}

function buildSnippet(value) {
  let text = String(value || '');
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end !== -1) text = text.slice(end + 4);
  }
  return text.slice(0, 4096).replace(/\s+/g, ' ').trim().slice(0, 260);
}

function compactLabel(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}

function normalizeReferenceLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}._/-]+/gu, ' ').trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function nextNumericId(items = [], prefix = 'row') {
  let max = 0;
  const pattern = new RegExp(`^${prefix}:(\\d+)$`);
  for (const item of items || []) {
    const match = String(item?.id || '').match(pattern);
    if (!match) continue;
    max = Math.max(max, Number(match[1]) || 0);
  }
  return max + 1;
}
