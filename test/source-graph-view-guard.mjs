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
  'groups off',
  'Markdown only',
  'Optional layers are off',
  'data-link-filter',
  'data-link-page',
  'data-toggle-link-compact',
  'data-open-url',
  'data-show-overview',
  'data-overview-page',
  'link-controls',
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
  'Source Graph MCP Guide',
  'showMcpGuide',
  'launcherSearch',
  'launcherSearchResults',
  'Search Markdown body',
  'retainContextWhenHidden',
  'vscode.getState',
  'vscode.setState',
  'restoreSearchState',
  'data-open-editor-path',
  'Real Codex Prompts',
  'copyGuideText',
  'Source Graph MCP의 source_graph_search tool',
  'data-copy-kind',
  'Source Graph MCP Status',
  'openSourceGraphMcpStatusPanel',
  'MCP is ready',
  'source_graph_search',
  'linksDepth',
  'copyMcpConfig',
  'openSourceGraphMcpGuidePanel',
]) {
  assert(source.includes(expected), `expected source graph webview to include ${expected}`);
}
const launcherSearchButton = source.indexOf('<button type="button" data-action="toggleSearch">Search</button>');
const launcherOpenGraphButton = source.indexOf('<button type="button" class="secondary" data-action="openGraph">Open Graph</button>');
assert(
  launcherSearchButton >= 0 && launcherOpenGraphButton > launcherSearchButton,
  'Source Graph launcher should put Search above Open Graph',
);
assert(
  source.includes('JSON.stringify(toWebviewSourceGraphDb(db))'),
  'source graph webview should embed only the slim graph DB payload',
);
assert(
  !source.includes('const json = JSON.stringify(db)'),
  'source graph webview must not embed the full DB with headings/searchIndex',
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
  'source graph webview should start with optional URL/Image/Missing layers disabled',
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
  source.includes('>&lsaquo;</button>') && source.includes('>&rsaquo;</button>'),
  'source graph pagination should use compact arrow controls with titles',
);
assert(
  source.includes("vscode.postMessage({ type: 'openUrl'"),
  'URL rows should post an openUrl message instead of behaving like missing file rows',
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
  openPanelBlock.includes('void updateSourceGraphIndex(context, workspaceFolder)'),
  'Open Source Graph should refresh the DB in the background after first render',
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
  'visibleGroupHulls',
  'round',
  'groupHullPath',
  'linkCategory',
  'linkTargetNodeId',
  'linkFocusEdgeKey',
].map(extractFunction).join('\n\n');

const script = `
${extracted}
const state = {
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
