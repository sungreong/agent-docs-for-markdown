import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const sourcePath = path.join(repoRoot, 'vscode-extension', 'src', 'commands', 'sourceGraph.ts');
const source = await fs.readFile(sourcePath, 'utf8');

for (const expected of [
  'id="toggleGroups"',
  'data-group-key',
  'toWebviewSourceGraphDb',
  'Preparing Markdown files...',
  'Source Graph DB missing',
  'Booting cached graph',
  'Webview initialization stopped',
  'startProgressiveRender',
  'Rendering Markdown files...',
  'Groups off',
  'Markdown files only',
  'Extra layers are off',
  'No document-to-document links yet',
  'document-to-document links',
  'local anchors separate',
  'function isMeaningfulDocumentEdge',
  '#meta { min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
  '@media (max-width: 1120px)',
  '@media (max-width: 860px)',
  '@media (max-width: 520px)',
  '.search-tools { grid-column:1 / -1; width:100%; min-width:0; display:grid; grid-template-columns:auto minmax(0,1fr) auto; }',
  'data-link-filter',
  'data-link-page',
  'data-toggle-link-compact',
  'data-open-url',
  'data-show-overview',
  'data-overview-page',
  'link-controls',
  'link-direction-tabs',
  'data-link-direction',
  'data-overview-sort',
  'function nodeRelationStats',
  'Direct ',
  '2-hop ',
  'resolveActiveLinkPanel',
  'openUrl',
  'simpleBrowser.show',
  'function linkPanel',
  'function linkCategory',
  'function paintOverviewDetails',
  'function showGraphOverview',
  'function linkTargetNodeId',
  'function linkFocusEdgeKey',
  'function visibleGroupHulls',
  'function groupHullPath',
  'function groupKeyForNode',
  'function paintGroupDetails',
  'const docById = new Map',
  'function currentNodeById',
  'function currentConnectedNodeIds',
  'function currentGroupNodeIds',
  'function currentGroupEntries',
  'function graphNodeBudget',
  'Performance preview',
  'Show Full Graph',
  'data-show-full-graph',
  'fullGraphConfirmed',
  'function autoSettleIterations',
  'function reportGraphMetric',
  'function visibleNodePositions',
  'function normalizeLayoutDrift',
  'function isSupplementalNode',
  'function nodeKindLabel',
  'function selectedNodeLinks',
  'function edgeDirectionCue',
  'circle.edge-cue',
  'Show broken or unresolved Markdown links',
  'control-icon url',
  'control-icon image',
  'control-icon missing',
  'control-icon group',
  'control-icon action',
  'nodeTypeChip',
  'overviewNodeRow',
  'meta-chip direct',
  'meta-chip hop',
  '<span>Broken</span>',
  '<span>Layout</span>',
  '<span>Refresh</span>',
  'Virtual link node',
  'virtual link node',
  'data-virtual-node',
  'data-node-kind',
  '[MPS Source Graph perf]',
  'repulsionCutoff2',
  'launcherSearch',
  'launcherSearchResults',
  'function searchDb',
  'searchSourceGraphSqlite',
  'sourceGraphSqliteModulePromise',
  'sourceGraphDbCache',
  'function loadSourceGraphSqliteModule',
  'function normalizeSourceGraphCachePath',
  'function trimSourceGraphDbCache',
  'Workspace Controls',
  'Apply Selected',
  'Select Page',
  'Select All',
  'Clear',
  'auto-compact',
  'ResizeObserver',
  'function pagePatterns',
  'function allPatterns',
  'function updateDensity',
  'Open .mps/.mpsignore',
  'Search Markdown body',
  'retainContextWhenHidden',
  'vscode.getState',
  'vscode.setState',
  'restoreSearchState',
  'data-open-editor-path',
  'toAuditManagerViewModel',
  'ensureSourceGraphAuditPanel',
  'renderSourceGraphAuditLoadingHtml',
  'ensureSourceWorkspaceFiles',
  'Opening Cleanup Audit',
  'Checking ignore suggestions',
  'Workspace Cleanup Audit',
  'What this screen does',
  'Cleanup Queue',
  'Why suggested',
  'data-label="Why"',
  '@media (max-width: 900px)',
  'const auditView = ${json};',
  'recommendations: visibleRecommendations',
  'reviewRows',
  'weakSpots',
]) {
  assert(source.includes(expected), `expected source graph webview to include ${expected}`);
}
const launcherStatusTitle = source.indexOf('<strong id="graphStatusTitle">Checking graph status...</strong>');
const launcherSearchSection = source.indexOf('<div id="searchPanel" class="search-panel is-open" aria-live="polite">');
const launcherPrimaryAction = source.indexOf('<button id="primaryGraphAction" type="button" data-action="initializeGraphGuided">Start Graph</button>');
assert(
  launcherSearchSection >= 0 && launcherStatusTitle > launcherSearchSection && launcherPrimaryAction > launcherStatusTitle,
  'Source Graph launcher should prioritize indexed search above the graph status and primary setup action',
);
assert(
  !source.includes('data-action="toggleSearch"'),
  'Source Graph launcher should keep indexed search visible instead of hiding it behind a toggle button',
);
assert(
  !source.includes('Tip: the graph icon in the File Browser toolbar opens this graph directly too.'),
  'Source Graph launcher should not mention the removed File Browser graph toolbar shortcut',
);
assert(
  source.includes('toolbar-grid') &&
    source.includes('.toolbar-grid { display: grid; grid-template-columns: 1fr; gap: 7px; }') &&
    source.includes('Maintenance') &&
    source.includes('Workspace Controls'),
  'Source Graph launcher should keep setup and maintenance controls visible near the top of the sidebar',
);
const workspaceControlsStart = source.indexOf('<div class="group-title">Workspace Controls</div>');
const auditPanelStartInLauncher = source.indexOf('<div id="auditPanel" class="audit-panel"', workspaceControlsStart);
const workspaceControlsBlock = source.slice(workspaceControlsStart, auditPanelStartInLauncher);
assert(
  workspaceControlsStart >= 0 &&
    auditPanelStartInLauncher > workspaceControlsStart &&
    workspaceControlsBlock.includes('data-action="runAudit"') &&
    workspaceControlsBlock.includes('data-action="editIgnore"') &&
    !workspaceControlsBlock.includes('data-action="openAuditManager"'),
  'Source Graph launcher should avoid a duplicate Open Cleanup Audit button in Workspace Controls',
);
assert(
  !source.includes('installSourceGraphSkill') && !source.includes('Agent Skill</button>'),
  'Source Graph launcher should not expose a separate Agent Skill button; bundled skill install belongs in the top skills download flow',
);
assert(
  source.includes('JSON.stringify(toWebviewSourceGraphDb(db))'),
  'source graph webview should embed only the slim graph DB payload',
);
assert(
  source.includes('const cached = sourceGraphDbCache.get(cacheKey)') &&
    source.includes('cached.mtimeMs === stat.mtimeMs && cached.size === stat.size') &&
    source.includes('sourceGraphDbCache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, db })') &&
    source.includes('trimSourceGraphDbCache()'),
  'Open Source Graph should reuse cached webview DB objects when the SQLite file mtime and size are unchanged',
);
assert(
  source.includes('if (!sourceGraphSqliteModulePromise)') &&
    source.includes('sourceGraphSqliteModulePromise = dynamicImport(pathToFileURL(sqliteModulePath).href)') &&
    source.includes('const sqlite = await loadSourceGraphSqliteModule(context)'),
  'Source Graph read/search paths should share one dynamic SQLite module import promise',
);
assert(
  source.includes('visualGraphCache = { nodes, edges, ...buildGraphIndexes(nodes, edges) }') &&
    source.includes('const nodeById = new Map(nodes.map((node) => [node.id, node]))') &&
    source.includes('return { nodeById, degreeByNode, edgesByNode, connectedNodeIds, groupNodeIds, groupEntries }'),
  'source graph webview should precompute node, edge, degree, connected, and group indexes once per visual graph',
);
assert(
  source.includes('const document = docById.get(selected.id)') &&
    source.includes('const selectedNode = currentNodeById().get(selectedId)') &&
    !source.includes('db.tables.documents.find((doc) => doc.id === selected.id)') &&
    !source.includes('currentNodes().find((item) => item.id === selectedId)'),
  'source graph interactions should use cached node/document maps instead of repeated full-array find calls',
);
assert(
    source.includes('.slice(0, graphNodeBudget())') &&
    source.includes(".slice(0, graphNodeBudget('search'))") &&
    source.includes('settleLayout(autoSettleIterations(80), { defer: true })') &&
    source.includes('settleLayout(isLargeGraphPreview() ? 8 : autoSettleIterations(36), { defer: true })'),
  'source graph webview should reduce automatic render and settle budgets for larger workspaces',
);
assert(
  source.includes('function paint(options = {})') &&
    source.includes('if (options.details !== false) paintDetails()') &&
    source.includes("requestAnimationFrame(() => paint({ details: false }))") &&
    source.includes('paint({ details: remaining <= 0 })') &&
    source.includes('paint({ details: false })'),
  'source graph webview should separate graph repaint from details repaint during animation, zoom, drag, and settle frames',
);
assert(
  source.includes('const values = visibleNodePositions()') &&
    !source.includes('const values = [...state.pos.values()]') &&
    source.includes('normalizeLayoutDrift();') &&
    source.includes('const scale = clamp(Math.min(width / graphWidth, height / graphHeight), 0.06, 1.8)') &&
    source.includes('state.transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.06, 2.8'),
  'Source Graph Fit should use visible node positions, tolerate far-spread layouts, and avoid wheel-scale jumps after fitting',
);
assert(
  source.includes("reportGraphMetric('rebuildGraphState', started)") &&
    source.includes("reportGraphMetric(options.details === false ? 'paint:graph' : 'paint:with-details', started)") &&
    source.includes("reportGraphMetric('paintDetails', started)"),
  'source graph webview should emit lightweight interaction timing metrics for rebuild, paint, and details rendering',
);
assert(
  !source.includes('currentEdges().flatMap((edge) => [edge.source, edge.target])') &&
    source.includes('currentConnectedNodeIds().has(node.id)') &&
    source.includes('currentGroupNodeIds().get(state.activeGroupKey)'),
  'source graph filtering should reuse connected and group indexes instead of rebuilding sets on every filter pass',
);
assert(
  !source.includes('const json = JSON.stringify(db)'),
  'source graph webview must not embed the full DB with headings/searchIndex',
);
assert(
  source.includes('JSON.stringify(toAuditManagerViewModel(audit))'),
  'Workspace Cleanup Audit webview should embed only its slim review view model',
);
const auditManagerStart = source.indexOf('async function openSourceGraphAuditManager');
const auditManagerEnd = source.indexOf('function ensureSourceGraphAuditPanel', auditManagerStart);
const auditManagerBlock = source.slice(auditManagerStart, auditManagerEnd);
assert(auditManagerStart >= 0 && auditManagerEnd > auditManagerStart, 'Workspace Cleanup Audit opener should be present');
assert(
  auditManagerBlock.indexOf('renderSourceGraphAuditLoadingHtml') >= 0 &&
    auditManagerBlock.indexOf('renderSourceGraphAuditLoadingHtml') < auditManagerBlock.indexOf('await runSourceGraphAudit'),
  'Workspace Cleanup Audit should open a loading webview before waiting for the full audit process',
);
assert(
  source.includes('async function ensureSourceWorkspaceFiles') &&
    source.includes('await ensureSourceWorkspaceFiles(workspaceFolder);') &&
    source.includes('const ignorePath = await ensureSourceWorkspaceFiles(workspaceFolder)'),
  'Source Graph commands should automatically create required .mps workspace files before audit/update/open flows',
);
assert(
  !source.includes('const json = JSON.stringify(audit)'),
  'Workspace Cleanup Audit webview must not embed the full audit object',
);
const auditPanelStart = source.indexOf('function renderSourceGraphAuditHtml');
const auditPanelEnd = source.indexOf('function renderSourceGraphLoadingHtml', auditPanelStart);
const auditPanelBlock = source.slice(auditPanelStart, auditPanelEnd);
assert(auditPanelStart >= 0 && auditPanelEnd > auditPanelStart, 'Workspace Cleanup Audit renderer should be present');
assert(
  !auditPanelBlock.includes('audit.ignore && audit.ignore.recommendations') &&
    !auditPanelBlock.includes('audit.graph && Array.isArray(audit.graph.duplicateCopyGroups)'),
  'Workspace Cleanup Audit client should render pre-shaped rows instead of traversing the full audit object',
);
assert(
  source.includes("let selectedId = '';"),
  'source graph webview should not pick the initial node before state is initialized',
);
assert(
  !source.includes('let selectedId = pickInitialNodeId()'),
  'source graph webview must not call pickInitialNodeId before state exists',
);
assert(
  source.includes('layers: { url: false, image: false, missing: false }'),
  'source graph webview should start with optional URL/Image/Broken layers disabled',
);
assert(
  !source.includes('runProgressiveStage('),
  'source graph webview must not auto-enable optional layers after the initial Markdown render',
);
assert(
  !source.includes("state.groupsEnabled = true;"),
  'source graph webview must not auto-enable folder groups during boot',
);
assert(
  !source.includes('currentNodes().find((node) => node.id === selectedId) || currentNodes()[0]'),
  'source graph details should allow a real overview state instead of forcing the first node selected',
);
assert(
  source.includes('data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button>'),
  'selected node details should include a compact Back to Overview action with an accessible label',
);
assert(
  source.includes('>View</button>') && source.includes('>Edit</button>') && source.includes("? 'Full' : 'Slim'"),
  'source graph panel buttons should use short labels in the narrow details pane',
);
assert(
  source.includes("linkDirectionTabs(outbound, inbound, activeLinkPanel)") &&
    source.includes("linkPanel(activeTitle, activeLinks, activeOpenSide, activeLinkPanel)") &&
    !source.includes("linkPanel('Outbound', outbound, 'target', 'outbound') +\n        linkPanel('Inbound', inbound, 'source', 'inbound')"),
  'selected node details should show Inbound/Outbound as count tabs and render only the active link list',
);
assert(
  source.includes('const selectedLinks = selectedNodeLinks(selected)') &&
    source.includes("inbound: (db.tables.links || []).filter((link) => linkTargetNodeId(link, 'target') === node.id)") &&
    source.includes('linkRows(pageItems, openSide, selectedId)') &&
    source.includes('function linkFocusEdgeKey(link, nodeId, openSide, selectedNodeId)'),
  'supplemental URL/Image/Missing nodes should derive detail links from the same graph target node ids used by visible edges',
);
assert(
  source.includes('>&lsaquo;</button>') && source.includes('>&rsaquo;</button>'),
  'source graph pagination should use compact arrow controls with titles',
);
assert(
  source.includes("vscode.postMessage({ type: 'openUrl'"),
  'URL rows should post an openUrl message instead of behaving like missing file rows',
);
assert(
  source.includes('edgeDirectionCue(edge, a, b, nodeById, active)') &&
    source.includes('function nodeRadius') &&
    !source.includes('marker-end="url(#arrow)"') &&
    !source.includes('<marker id="arrow"'),
  'Source Graph should use lightweight endpoint dots instead of oversized SVG arrow markers',
);
assert(
  source.includes("await vscode.commands.executeCommand('simpleBrowser.show', value)"),
  'extension host should try to open Source Graph URLs inside VS Code Simple Browser first',
);
assert(
  source.includes('await vscode.env.openExternal(uri)'),
  'extension host should keep external browser as a fallback when VS Code cannot show the URL internally',
);

const openPanelStart = source.indexOf('async function openSourceGraphPanel');
const openPanelEnd = source.indexOf('async function searchSourceGraph', openPanelStart);
const openPanelBlock = source.slice(openPanelStart, openPanelEnd);
assert(openPanelStart >= 0 && openPanelEnd > openPanelStart, 'openSourceGraphPanel should be present');
assert(
  openPanelBlock.includes('const db = await readDb(context, workspaceFolder)'),
  'Open Source Graph should render a cached DB before kicking off a full update',
);
assert(
  openPanelBlock.indexOf("renderSourceGraphLoadingHtml(\n      sourceGraphPanel.webview,\n      'Opening cached graph'") >= 0 &&
    openPanelBlock.indexOf("renderSourceGraphLoadingHtml(\n      sourceGraphPanel.webview,\n      'Opening cached graph'") <
      openPanelBlock.indexOf('const db = await readDb(context, workspaceFolder)'),
  'Open Source Graph should show immediate loading feedback before reading the cached DB',
);
assert(
  openPanelBlock.includes('scheduleOpenSourceGraphRefresh(context, workspaceFolder, generation, renderedCachedDb, cachedDb)'),
  'Open Source Graph should schedule its background refresh after the cached graph renders',
);
assert(
  source.includes('OPEN_REFRESH_DELAY_MS') &&
    source.includes('OPEN_REFRESH_COOLDOWN_MS') &&
    source.includes('function isFreshSourceGraphDb') &&
    source.includes('void updateSourceGraphIndex(context, workspaceFolder)'),
  'Open Source Graph should delay and throttle automatic refresh work so the panel stays responsive',
);
assert(
  !openPanelBlock.includes('const db = await updateSourceGraphIndex(context, workspaceFolder)'),
  'Open Source Graph must not block the first panel render on a full DB rebuild',
);

const extracted = [
  'normalizeGraphPath',
  'groupKeyForNode',
  'groupLabel',
  'groupColor',
  'graphNodeBudget',
  'autoSettleIterations',
  'visibleGroupHulls',
  'round',
  'groupHullPath',
  'linkCategory',
  'linkTargetNodeId',
  'linkFocusEdgeKey',
  'isMeaningfulDocumentEdge',
].map(extractFunction).join('\n\n');

const script = `
${extracted}
const db = { tables: { documents: Array.from({ length: 1500 }, (_, index) => ({ id: 'doc:' + index })) } };
let state = { fullGraphConfirmed: true, activeGroupKey: '' };
if (graphNodeBudget() !== 120) throw new Error('expected 1000+ doc workspaces to use a 120-node graph budget');
if (graphNodeBudget('search') !== 120) throw new Error('expected search graphs to cap at 120 nodes');
if (autoSettleIterations(80) !== 28) throw new Error('expected 1000+ doc workspaces to shorten automatic settle passes');
state.fullGraphConfirmed = false;
if (graphNodeBudget() !== 42) throw new Error('expected large unconfirmed workspaces to open in a 42-node preview');
if (graphNodeBudget('search') !== 60) throw new Error('expected large unconfirmed searches to open in a 60-node preview');
state.fullGraphConfirmed = true;
db.tables.documents = Array.from({ length: 5200 }, (_, index) => ({ id: 'doc:' + index }));
if (graphNodeBudget() !== 80) throw new Error('expected 5000+ doc workspaces to use an 80-node graph budget');
if (autoSettleIterations(80) !== 20) throw new Error('expected 5000+ doc workspaces to shorten automatic settle passes further');
db.tables.documents = [{ id: 'doc:small' }];
if (graphNodeBudget() !== 160) throw new Error('expected small workspaces to keep the rich 160-node graph budget');
state = {
  groupsEnabled: true,
  activeGroupKey: '',
  nodes: [
    { id: 'a', kind: 'document', path: 'docs/alpha.md' },
    { id: 'b', kind: 'document', path: 'docs/beta.md' },
    { id: 'c', kind: 'document', path: 'docs/gamma.md' },
    { id: 'd', kind: 'document', path: 'notes/delta.md' },
  ],
  pos: new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 80, y: 12 }],
    ['c', { x: 24, y: 92 }],
    ['d', { x: 320, y: 40 }],
  ]),
};
let hulls = visibleGroupHulls();
if (hulls.length !== 1) throw new Error('expected one visible group hull for 3 docs');
if (hulls[0].key !== 'docs') throw new Error('expected docs group hull');
const firstPath = groupHullPath(hulls[0]);
state.pos.set('b', { x: 190, y: 86 });
hulls = visibleGroupHulls();
const movedPath = groupHullPath(hulls[0]);
if (firstPath === movedPath) throw new Error('expected group hull path to change after node movement');
if (hulls[0].width <= 190) throw new Error('expected moved hull to expand around dragged nodes');
state.activeGroupKey = 'notes';
hulls = visibleGroupHulls();
if (hulls.length !== 1 || hulls[0].key !== 'notes') throw new Error('expected active single-node group hull');
const urlLink = {
  sourceDocumentId: 'doc:a',
  targetDocumentId: '',
  targetPath: 'https://example.com/docs?a=1',
  href: 'https://example.com/docs?a=1',
  type: 'url',
  status: 'external',
};
const urlNode = linkTargetNodeId(urlLink, 'target');
if (urlNode !== 'url:https://example.com/docs?a=1') throw new Error('expected URL links to resolve to supplemental URL node ids');
if (linkFocusEdgeKey(urlLink, urlNode, 'target') !== 'doc:a->url:https://example.com/docs?a=1') throw new Error('expected URL links to focus the supplemental URL edge');
if (isMeaningfulDocumentEdge({ source: 'doc:a', target: 'doc:b', status: 'resolved' }) !== true) throw new Error('expected document-to-document links to remain meaningful');
if (isMeaningfulDocumentEdge({ source: 'doc:a', target: 'doc:a', status: 'local-anchor' }) !== false) throw new Error('expected local anchors to be excluded from meaningful document connections');
if (isMeaningfulDocumentEdge({ source: 'doc:a', target: 'doc:a', status: 'resolved' }) !== false) throw new Error('expected self loops to be excluded from meaningful document connections');
`;

vm.runInNewContext(script, {}, { timeout: 1000 });

console.log('source graph view guard passed');

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1).replace(/\\\\/g, '\\');
  }
  throw new Error(`could not extract ${name}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
