import * as vscode from 'vscode';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MPS_IGNORE_FILE, isSourceIgnoredUri } from '../utils/sourceIgnore.js';

interface SourceGraphDb {
  updatedAt: string;
  root: string;
  tables: {
    documents: SourceGraphDocument[];
    links: SourceGraphLink[];
  };
  graph: {
    nodes: SourceGraphNode[];
    edges: SourceGraphEdge[];
  };
}

interface SourceGraphDocument {
  id: string;
  path: string;
  title: string;
  incomingCount: number;
  outgoingCount: number;
  headingCount: number;
  wordCount: number;
  snippet: string;
}

interface SourceGraphLink {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  sourcePath: string;
  targetPath: string;
  href: string;
  label: string;
  type: string;
  line: number;
  status: string;
}

interface SourceGraphNode {
  id: string;
  path: string;
  label: string;
  kind: string;
  weight: number;
}

interface SourceGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  status: string;
  line: number;
}

interface SourceGraphWebviewMessage {
  type?: unknown;
  path?: unknown;
  href?: unknown;
  query?: unknown;
  mode?: unknown;
  requestId?: unknown;
  text?: unknown;
}

const DB_RELATIVE_PATH = path.join('.mps', 'source-graph.sqlite');
const SKILL_COPY_EXCLUDED_NAMES = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'desktop.ini']);
const workspaceMcpSkillProfiles = [
  {
    id: 'claude',
    label: 'Claude',
    sourcePathSegments: ['ai_skills', 'claude', 'skills'],
    targetPathSegments: ['.claude', 'skills'],
  },
  {
    id: 'agents',
    label: 'Agents',
    sourcePathSegments: ['ai_skills', 'agents', 'skills'],
    targetPathSegments: ['.agents', 'skills'],
  },
  {
    id: 'codex',
    label: 'Codex',
    sourcePathSegments: ['ai_skills', 'codex', 'skills'],
    targetPathSegments: ['.codex', 'skills'],
  },
] as const;
let sourceGraphPanel: vscode.WebviewPanel | null = null;
let sourceGraphMcpGuidePanel: vscode.WebviewPanel | null = null;
let sourceGraphMcpStatusPanel: vscode.WebviewPanel | null = null;
let sourceGraphWorkspaceFolder: vscode.WorkspaceFolder | null = null;
let sourceGraphRenderGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function registerSourceGraphCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'markdownAgentDocsSourceGraphLauncher',
      {
        resolveWebviewView(webviewView) {
          renderSourceGraphLauncherView(webviewView);
          webviewView.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
            if (!message || typeof message !== 'object') return;
            if (message.type === 'openGraph') void vscode.commands.executeCommand('markdownAgentDocs.openSourceGraph');
            if (message.type === 'initializeGraph') void vscode.commands.executeCommand('markdownAgentDocs.initializeSourceGraphWorkspace');
            if (message.type === 'updateGraph') void vscode.commands.executeCommand('markdownAgentDocs.updateSourceGraph');
            if (message.type === 'launcherSearch') {
              void respondToLauncherSourceGraphSearch(context, webviewView.webview, message);
            }
            if (message.type === 'openPath' && typeof message.path === 'string') {
              void openLauncherGraphPath(message.path, false);
            }
            if (message.type === 'openEditorPath' && typeof message.path === 'string') {
              void openLauncherGraphPath(message.path, true);
            }
            if (message.type === 'editIgnore') void vscode.commands.executeCommand('markdownAgentDocs.openSourceIgnoreFile');
            if (message.type === 'copyMcpConfig') void vscode.commands.executeCommand('markdownAgentDocs.copyCodexMcpConfig');
            if (message.type === 'showMcpGuide') openSourceGraphMcpGuidePanel(context);
            if (message.type === 'installMcp') void vscode.commands.executeCommand('markdownAgentDocs.installCodexMcp');
            if (message.type === 'checkMcp') void vscode.commands.executeCommand('markdownAgentDocs.checkCodexMcpStatus');
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    registerSourceGraphCommand('markdownAgentDocs.openSourceGraph', async () => {
      await openSourceGraphPanel(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.initializeSourceGraphWorkspace', async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) return;
      await updateSourceGraphIndex(context, workspaceFolder);
      void vscode.window.showInformationMessage(`Agent Docs source graph initialized: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('markdownAgentDocs.updateSourceGraph', async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) return;
      await updateSourceGraphIndex(context, workspaceFolder);
      void vscode.window.showInformationMessage(`Agent Docs source graph updated: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('markdownAgentDocs.searchSourceGraph', async () => {
      await searchSourceGraph(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.openSourceIgnoreFile', async () => {
      await openSourceIgnoreFile();
    }),
    registerSourceGraphCommand('markdownAgentDocs.copyCodexMcpConfig', async () => {
      await copyCodexMcpConfig(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.installCodexMcp', async () => {
      await installCodexMcp(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.checkCodexMcpStatus', async () => {
      await checkCodexMcpStatus(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.removeCodexMcp', async () => {
      await removeCodexMcp(context);
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{md,mdx,markdown,mdown,mkd,mkdn}');
  const ignoreWatcher = vscode.workspace.createFileSystemWatcher(`**/${MPS_IGNORE_FILE}`);
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full')),
    watcher.onDidChange((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'file')),
    watcher.onDidDelete((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full')),
    ignoreWatcher,
    ignoreWatcher.onDidCreate((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
    ignoreWatcher.onDidChange((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
    ignoreWatcher.onDidDelete((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
  );
}

function renderSourceGraphLauncherView(webviewView: vscode.WebviewView): void {
  const nonce = createNonce();
  webviewView.webview.options = { enableScripts: true };
  webviewView.webview.html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 10px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    .stack { display: grid; gap: 10px; }
    .head { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); }
    .head strong { font-size: 13px; }
    .head span { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
    button { width: 100%; min-height: 28px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; padding: 5px 7px; text-align: left; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font: inherit; font-size: 12px; line-height: 1.25; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .group { display: grid; gap: 6px; }
    .group-title { color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .button-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .search-panel { display: none; gap: 7px; padding: 8px; border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); border-radius: 5px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .search-panel.is-open { display: grid; }
    .search-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; }
    .search-input { width: 100%; min-width: 0; height: 28px; border: 1px solid var(--vscode-input-border, rgba(128,128,128,.35)); border-radius: 3px; padding: 4px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font: inherit; font-size: 12px; }
    .mode-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .mode-tabs button { min-height: 24px; padding: 4px 6px; text-align: center; color: var(--vscode-descriptionForeground); background: transparent; border-color: var(--vscode-button-border, rgba(128,128,128,.25)); }
    .mode-tabs button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .icon-button { width: 28px; min-height: 28px; padding: 0; text-align: center; }
    .search-meta { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; }
    .results { display: grid; gap: 5px; max-height: 360px; overflow: auto; }
    .result { display: grid; gap: 4px; padding: 7px; border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.22)); border-radius: 4px; background: var(--vscode-sideBar-background); cursor: pointer; }
    .result:hover { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .result-title { display: flex; justify-content: space-between; gap: 6px; color: var(--vscode-foreground); font-size: 12px; font-weight: 600; }
    .badge { color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); border-radius: 999px; padding: 1px 6px; font-size: 10px; font-weight: 700; }
    .result-path, .result-snippet { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
    .result-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .result-actions button { min-height: 24px; padding: 4px 6px; text-align: center; font-size: 11px; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="stack">
    <div class="head">
      <strong>Source Graph</strong>
      <span>Open the workspace Markdown graph, update the index, or connect an MCP client.</span>
    </div>
    <button type="button" data-action="toggleSearch">Search</button>
    <div id="searchPanel" class="search-panel" aria-live="polite">
      <div class="mode-tabs" role="group" aria-label="Search mode">
        <button id="launcherSearchBody" type="button" aria-pressed="true">Body</button>
        <button id="launcherSearchFile" type="button" aria-pressed="false">File</button>
      </div>
      <div class="search-row">
        <input id="launcherSearchInput" class="search-input" type="search" placeholder="Search Markdown body..." aria-label="Search Markdown body text" />
        <button id="launcherSearchRun" class="icon-button secondary" type="button" title="Run search" aria-label="Run search">↵</button>
      </div>
      <div id="launcherSearchMeta" class="search-meta">Search body text across indexed Markdown files.</div>
      <div id="launcherSearchResults" class="results"></div>
    </div>
    <button type="button" class="secondary" data-action="openGraph">Open Graph</button>
    <div class="group">
      <div class="group-title">Workspace</div>
      <div class="button-grid">
        <button type="button" class="secondary" data-action="initializeGraph">Initialize DB</button>
        <button type="button" class="secondary" data-action="updateGraph">Update</button>
        <button type="button" class="secondary" data-action="editIgnore">Ignore</button>
        <button type="button" class="secondary" data-action="openGraph">Graph</button>
      </div>
    </div>
    <div class="group">
      <div class="group-title">MCP</div>
      <div class="button-grid">
        <button type="button" class="secondary" data-action="installMcp">Install</button>
        <button type="button" class="secondary" data-action="checkMcp">Status</button>
        <button type="button" class="secondary" data-action="showMcpGuide">Guide</button>
        <button type="button" class="secondary" data-action="copyMcpConfig">Copy Config</button>
      </div>
    </div>
    <div class="hint">Tip: the graph icon in the File Browser toolbar opens this graph directly too.</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const searchPanel = document.getElementById('searchPanel');
    const searchInput = document.getElementById('launcherSearchInput');
    const searchRun = document.getElementById('launcherSearchRun');
    const searchMeta = document.getElementById('launcherSearchMeta');
    const searchResults = document.getElementById('launcherSearchResults');
    const bodyMode = document.getElementById('launcherSearchBody');
    const fileMode = document.getElementById('launcherSearchFile');
    const restored = vscode.getState && vscode.getState() || {};
    let mode = restored.mode === 'file' ? 'file' : 'body';
    let requestId = Number(restored.requestId || 0);
    let searchTimer = 0;
    let lastResults = Array.isArray(restored.results) ? restored.results : [];
    let lastQuery = String(restored.query || '');
    let lastMeta = String(restored.meta || '');
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    }
    function saveSearchState() {
      vscode.setState({
        open: searchPanel.classList.contains('is-open'),
        mode,
        query: searchInput.value,
        requestId,
        results: lastResults,
        meta: searchMeta.textContent || '',
      });
    }
    function applyModeChrome() {
      bodyMode.setAttribute('aria-pressed', String(mode === 'body'));
      fileMode.setAttribute('aria-pressed', String(mode === 'file'));
      searchInput.placeholder = mode === 'body' ? 'Search Markdown body...' : 'Search file name or path...';
      searchInput.setAttribute('aria-label', mode === 'body' ? 'Search Markdown body text' : 'Search Markdown file names and paths');
    }
    function defaultSearchMeta() {
      return mode === 'body' ? 'Search body text across indexed Markdown files.' : 'Search titles, file names, and paths.';
    }
    function setMode(nextMode) {
      mode = nextMode;
      applyModeChrome();
      searchMeta.textContent = defaultSearchMeta();
      lastResults = [];
      lastQuery = '';
      searchResults.innerHTML = '';
      saveSearchState();
      runSearch();
    }
    function openSearchPanel(focus = true) {
      searchPanel.classList.add('is-open');
      saveSearchState();
      if (focus) searchInput.focus();
    }
    function runSearch() {
      const query = searchInput.value.trim();
      clearTimeout(searchTimer);
      if (!query) {
        searchResults.innerHTML = '';
        lastResults = [];
        lastQuery = '';
        searchMeta.textContent = defaultSearchMeta();
        saveSearchState();
        return;
      }
      const id = ++requestId;
      searchMeta.textContent = 'Searching...';
      saveSearchState();
      vscode.postMessage({ type: 'launcherSearch', mode, query, requestId: id });
    }
    function scheduleSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 180);
    }
    function renderResults(message) {
      if (Number(message.requestId || 0) !== requestId) return;
      const results = Array.isArray(message.results) ? message.results : [];
      if (message.error) {
        searchMeta.textContent = 'Search failed. Check Source Graph status.';
        searchResults.innerHTML = '<div class="hint">' + escapeHtml(message.error) + '</div>';
        lastResults = [];
        lastQuery = String(message.query || '');
        saveSearchState();
        return;
      }
      searchMeta.textContent = results.length + ' result' + (results.length === 1 ? '' : 's') + ' for "' + escapeHtml(message.query || '') + '"';
      lastResults = results;
      lastQuery = String(message.query || '');
      searchResults.innerHTML = results.length ? results.map((item) => {
        return '<div class="result" data-open-path="' + escapeHtml(item.path) + '">' +
          '<div class="result-title"><span>' + escapeHtml(item.title || item.path) + '</span><span class="badge">' + escapeHtml(item.score) + '</span></div>' +
          '<div class="result-path">' + escapeHtml(item.path) + '</div>' +
          '<div class="result-snippet">' + escapeHtml(item.snippet || '') + '</div>' +
          '<div class="result-actions"><button type="button" class="secondary" data-open-path="' + escapeHtml(item.path) + '">View</button><button type="button" class="secondary" data-open-editor-path="' + escapeHtml(item.path) + '">Edit</button></div>' +
        '</div>';
      }).join('') : '<div class="hint">No matching Markdown files.</div>';
      saveSearchState();
    }
    function restoreSearchState() {
      applyModeChrome();
      searchInput.value = String(restored.query || '');
      if (restored.open) openSearchPanel(false);
      if (lastResults.length) {
        renderResults({ requestId, query: restored.query || '', results: lastResults });
        return;
      }
      searchMeta.textContent = lastMeta || defaultSearchMeta();
    }
    bodyMode.addEventListener('click', () => setMode('body'));
    fileMode.addEventListener('click', () => setMode('file'));
    searchRun.addEventListener('click', runSearch);
    searchInput.addEventListener('input', scheduleSearch);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch();
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'launcherSearchResults') renderResults(message);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest && event.target.closest('[data-action]');
      if (button) {
        const action = button.getAttribute('data-action');
        if (action === 'toggleSearch') {
          openSearchPanel();
          return;
        }
        vscode.postMessage({ type: action });
        return;
      }
      const editor = event.target.closest && event.target.closest('[data-open-editor-path]');
      if (editor) {
        event.stopPropagation();
        vscode.postMessage({ type: 'openEditorPath', path: editor.getAttribute('data-open-editor-path') });
        return;
      }
      const opener = event.target.closest && event.target.closest('[data-open-path]');
      if (opener) {
        vscode.postMessage({ type: 'openPath', path: opener.getAttribute('data-open-path') });
      }
    });
    restoreSearchState();
  </script>
</body>
</html>`;
}

async function respondToLauncherSourceGraphSearch(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  message: SourceGraphWebviewMessage,
): Promise<void> {
  const query = String(message.query || '').trim();
  const requestId = Number(message.requestId || 0);
  const mode = message.mode === 'file' ? 'file' : 'body';
  if (!query) {
    await webview.postMessage({ type: 'launcherSearchResults', mode, query, requestId, results: [] });
    return;
  }
  try {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      await webview.postMessage({ type: 'launcherSearchResults', mode, query, requestId, results: [] });
      return;
    }
    const db = await loadOrUpdateDb(context, workspaceFolder);
    const results = mode === 'body'
      ? await searchBodyDocuments(workspaceFolder, db, query, 80)
      : searchFileDocuments(db, query, 80);
    await webview.postMessage({
      type: 'launcherSearchResults',
      mode,
      query,
      requestId,
      results: results.map((item) => ({
        path: item.document.path,
        title: item.document.title || path.basename(item.document.path),
        snippet: item.document.snippet,
        score: item.score,
        incomingCount: item.document.incomingCount,
        outgoingCount: item.document.outgoingCount,
        wordCount: item.document.wordCount,
      })),
    });
  } catch (error) {
    await webview.postMessage({
      type: 'launcherSearchResults',
      mode,
      query,
      requestId,
      results: [],
      error: stringifyError(error),
    });
  }
}

async function openLauncherGraphPath(relativePath: string, inEditor: boolean): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  if (inEditor) await openGraphPathInEditor(workspaceFolder, relativePath);
  else await openGraphPathInViewer(workspaceFolder, relativePath);
}

function openSourceGraphMcpGuidePanel(context: vscode.ExtensionContext): void {
  if (sourceGraphMcpGuidePanel) {
    sourceGraphMcpGuidePanel.reveal(vscode.ViewColumn.Beside);
    return;
  }
  sourceGraphMcpGuidePanel = vscode.window.createWebviewPanel(
    'markdownAgentDocsSourceGraphMcpGuide',
    'Source Graph MCP Guide',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  sourceGraphMcpGuidePanel.onDidDispose(() => {
    sourceGraphMcpGuidePanel = null;
  }, null, context.subscriptions);
  sourceGraphMcpGuidePanel.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'copyGuideText' && typeof message.text === 'string') {
      void vscode.env.clipboard.writeText(message.text)
        .then(() => vscode.window.showInformationMessage('Source Graph MCP example copied.'));
    }
  }, null, context.subscriptions);
  sourceGraphMcpGuidePanel.webview.html = renderSourceGraphMcpGuideHtml(sourceGraphMcpGuidePanel.webview);
}

function renderSourceGraphMcpGuideHtml(webview: vscode.Webview): string {
  const nonce = createNonce();
  const promptExamples = [
    {
      title: 'Search Body Text',
      text: 'Source Graph MCP의 source_graph_search tool을 써서 "채용 공고"가 본문에 나오는 Markdown 파일을 찾아줘. query는 "채용 공고", limit은 10으로 해줘.',
    },
    {
      title: 'Find Linked Context',
      text: 'Source Graph MCP의 source_graph_search tool을 써서 "Source Graph" 관련 문서를 찾고, 각 결과에서 연결된 문서 맥락도 linksDepth 2까지 같이 요약해줘. query는 "Source Graph", limit은 5, linksDepth는 2로 해줘.',
    },
    {
      title: 'Trace Neighbors',
      text: 'Source Graph MCP의 source_graph_neighbors tool을 써서 README.md가 링크하는 문서와 README.md를 링크하는 문서를 보여줘. path는 README.md, depth는 1로 해줘.',
    },
    {
      title: 'Recommend Related Docs',
      text: 'Source Graph MCP의 source_graph_related tool을 써서 README.md 다음에 읽을 만한 관련 Markdown 문서 5개를 추천해줘. path는 README.md, limit은 5로 해줘.',
    },
    {
      title: 'Refresh Index',
      text: 'Source Graph MCP의 source_graph_update tool을 써서 방금 수정한 Markdown workspace 그래프 인덱스를 다시 갱신해줘.',
    },
  ];
  const toolExamples = [
    {
      title: 'source_graph_search',
      text: JSON.stringify({ query: '검색어 또는 파일 주제', limit: 5, linksDepth: 2 }, null, 2),
    },
    {
      title: 'source_graph_neighbors',
      text: JSON.stringify({ path: 'README.md', depth: 1 }, null, 2),
    },
    {
      title: 'source_graph_related',
      text: JSON.stringify({ path: 'README.md', limit: 5 }, null, 2),
    },
    {
      title: 'source_graph_update',
      text: JSON.stringify({}, null, 2),
    },
  ];
  const copyCards = (items: Array<{ title: string; text: string }>, kind: string) => items.map((item, index) => `
        <div class="copy-card">
          <div class="copy-head"><strong>${escapeHtmlText(item.title)}</strong><button type="button" data-copy-kind="${kind}" data-copy-index="${index}">Copy</button></div>
          <pre>${escapeHtmlText(item.text)}</pre>
        </div>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
  <title>Source Graph MCP Guide</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 980px; margin: 0 auto; padding: 28px 32px 40px; }
    header { display: grid; gap: 8px; padding-bottom: 18px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); }
    .kicker { color: var(--vscode-textLink-foreground); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.6; }
    section { display: grid; gap: 12px; padding: 22px 0; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.18)); }
    h2 { margin: 0; font-size: 15px; line-height: 1.35; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
    .tool { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.28)); border-radius: 6px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .copy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 10px; }
    .copy-card { display: grid; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.28)); border-radius: 6px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .copy-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .copy-head strong { min-width: 0; font-size: 12px; }
    .copy-head button { flex: 0 0 auto; min-height: 26px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 4px 9px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font: inherit; font-size: 12px; }
    .copy-head button:hover { background: var(--vscode-button-hoverBackground); }
    code { color: var(--vscode-textPreformat-foreground, var(--vscode-editor-foreground)); font-family: var(--vscode-editor-font-family); font-size: .95em; }
    pre { overflow: auto; margin: 0; padding: 12px; border-radius: 6px; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background, var(--vscode-editorWidget-background)); font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.55; }
    .steps { display: grid; gap: 8px; }
    .step { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; }
    .num { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font-size: 11px; font-weight: 700; }
    .fields { display: grid; gap: 8px; }
    .field { display: grid; grid-template-columns: minmax(140px, .5fr) 1fr; gap: 12px; }
    @media (max-width: 680px) {
      main { padding: 20px; }
      .field { grid-template-columns: 1fr; gap: 3px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="kicker">Agent Docs for Markdown</div>
      <h1>Source Graph MCP Guide</h1>
      <p>Use this when Codex needs to search local Markdown, trace backlinks, find related sources, or refresh the workspace graph after edits.</p>
    </header>
    <section>
      <h2>Recommended Flow</h2>
      <div class="steps">
        <div class="step"><div class="num">1</div><p>Run <code>Initialize DB</code> once per workspace to create <code>.mps/source-graph.sqlite</code>.</p></div>
        <div class="step"><div class="num">2</div><p>Run <code>Install MCP</code> so Codex can load the workspace Source Graph server.</p></div>
        <div class="step"><div class="num">3</div><p>Restart Codex or start a new trusted workspace session, then ask Codex to search, trace, or update the graph.</p></div>
      </div>
    </section>
    <section>
      <h2>MCP Tools</h2>
      <div class="grid">
        <div class="tool"><code>source_graph_update</code><p>Rebuilds the workspace Source Graph index.</p></div>
        <div class="tool"><code>source_graph_search</code><p>Searches Markdown title, path, and body. Add <code>linksDepth</code> to include link context inside each result.</p></div>
        <div class="tool"><code>source_graph_related</code><p>Ranks related documents using links, backlinks, and shared terms.</p></div>
        <div class="tool"><code>source_graph_neighbors</code><p>Returns inbound and outbound neighbors for a document path or document id.</p></div>
      </div>
    </section>
    <section>
      <h2>Real Codex Prompts</h2>
      <p>Copy one of these into Codex when you want it to use the Source Graph MCP tool explicitly.</p>
      <div class="copy-grid">
        ${copyCards(promptExamples, 'prompt')}
      </div>
    </section>
    <section>
      <h2>Tool Inputs</h2>
      <p>Use these argument shapes when you want to describe the exact MCP tool input.</p>
      <div class="copy-grid">
        ${copyCards(toolExamples, 'tool')}
      </div>
    </section>
    <section>
      <h2>Search Result With Links</h2>
      <pre>{
  &quot;path&quot;: &quot;README.md&quot;,
  &quot;title&quot;: &quot;Agent Docs for Markdown&quot;,
  &quot;score&quot;: 8,
  &quot;linksDepth&quot;: 2,
  &quot;linkedDocuments&quot;: [...],
  &quot;links&quot;: [...]
}</pre>
      <div class="fields">
        <div class="field"><code>linkedDocuments</code><p>Documents reached from the search hit within the requested depth.</p></div>
        <div class="field"><code>links</code><p>Raw graph edges with <code>sourcePath</code>, <code>targetPath</code>, <code>label</code>, <code>status</code>, and <code>line</code>.</p></div>
        <div class="field"><code>linksDepth</code><p>The graph radius used to collect the link context. Search supports depth 1 through 3.</p></div>
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const copies = {
      prompt: ${JSON.stringify(promptExamples.map((item) => item.text))},
      tool: ${JSON.stringify(toolExamples.map((item) => item.text))},
    };
    document.addEventListener('click', (event) => {
      const button = event.target.closest && event.target.closest('[data-copy-kind]');
      if (!button) return;
      const kind = button.getAttribute('data-copy-kind');
      const index = Number(button.getAttribute('data-copy-index') || 0);
      const text = copies[kind] && copies[kind][index];
      if (!text) return;
      vscode.postMessage({ type: 'copyGuideText', text });
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1200);
    });
  </script>
</body>
</html>`;
}

function registerSourceGraphCommand(command: string, handler: (...args: unknown[]) => Promise<void>): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: unknown[]) => {
    try {
      await handler(...args);
    } catch (error) {
      await showSourceGraphError(command, error);
    }
  });
}

async function copyCodexMcpConfig(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const scriptPath = resolveSourceGraphScriptPath(context);
  const root = workspaceFolder.uri.fsPath;
  const serverName = getMcpServerName(workspaceFolder, 'workspace');
  const nodeCommand = await resolveMcpNodeCommand(workspaceFolder);
  const snippet = [
    '# Codex .codex/config.toml',
    buildMcpTomlBlock(serverName, nodeCommand, scriptPath, root, false).trimEnd(),
    '',
    '# Claude / MCP .mcp.json',
    JSON.stringify(buildMcpJsonConfig(serverName, nodeCommand, scriptPath, root), null, 2),
    '',
  ].join('\n');
  await vscode.env.clipboard.writeText(snippet);
  void vscode.window.showInformationMessage('Source Graph MCP config copied for Codex config.toml and Claude-compatible .mcp.json.');
}

async function installCodexMcp(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const scriptPath = resolveSourceGraphScriptPath(context);
  await assertSourceGraphPreflight(scriptPath, workspaceFolder);
  const root = workspaceFolder.uri.fsPath;
  const serverName = getMcpServerName(workspaceFolder, 'workspace');
  const nodeCommand = await resolveMcpNodeCommand(workspaceFolder);
  const codexConfigPath = getCodexConfigPath(workspaceFolder, 'workspace');
  const mcpJsonPath = getWorkspaceMcpJsonPath(workspaceFolder);
  const target = await pickMcpInstallTarget(workspaceFolder, serverName, codexConfigPath, mcpJsonPath);
  if (!target) return;
  const skillRoots = await ensureWorkspaceMcpSkillFolders(context, workspaceFolder);
  await updateSourceGraphIndex(context, workspaceFolder);
  const backupPaths: string[] = [];
  const configPaths: string[] = [];
  if (target === 'all' || target === 'mcp-json') {
    const backupPath = await upsertMcpJsonServer(mcpJsonPath, serverName, nodeCommand, scriptPath, root);
    if (backupPath) backupPaths.push(backupPath);
    configPaths.push(mcpJsonPath);
  }
  if (target === 'all' || target === 'codex') {
    const backupPath = await upsertManagedMcpBlock(codexConfigPath, serverName, nodeCommand, scriptPath, root);
    if (backupPath) backupPaths.push(backupPath);
    configPaths.push(codexConfigPath);
  }
  const backupText = backupPaths.length ? ` Backups: ${backupPaths.join(', ')}` : '';
  const skillsText = skillRoots.length ? ` Skill roots prepared: ${skillRoots.join(', ')}.` : '';
  void vscode.window.showInformationMessage(
    `Agent Docs Source Graph MCP installed for this workspace. Configs: ${configPaths.join(', ')}.${backupText}${skillsText} Claude may require project approval in /mcp. Codex shows project MCP only after opening a fresh trusted session for this workspace.`,
  );
}

async function checkCodexMcpStatus(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const scriptPath = resolveSourceGraphScriptPath(context);
  const dbPath = getDbPath(workspaceFolder);
  const workspaceConfigPath = getCodexConfigPath(workspaceFolder, 'workspace');
  const mcpJsonPath = getWorkspaceMcpJsonPath(workspaceFolder);
  const workspaceServerName = getMcpServerName(workspaceFolder, 'workspace');
  const node = await checkNodeAvailable();
  const scriptExists = await pathExists(scriptPath);
  const dbExists = await pathExists(dbPath);
  const workspaceConfig = await inspectCodexConfigRegistration(workspaceConfigPath, workspaceServerName);
  const mcpJsonConfig = await inspectMcpJsonRegistration(mcpJsonPath, workspaceServerName);
  const claudeStatus = await inspectClaudeMcpStatus(workspaceFolder, workspaceServerName, mcpJsonConfig.registered);
  const codexStatus = await inspectCodexMcpStatus(workspaceFolder, workspaceServerName, workspaceConfig.registered);
  const skillRoots = await inspectWorkspaceMcpSkillRoots(workspaceFolder);
  const items: SourceGraphMcpStatusItem[] = [
    {
      label: 'Node.js',
      state: node.startsWith('not available') ? 'bad' : 'ok',
      value: node,
      detail: node.startsWith('not available')
        ? 'Set markdownAgentDocs.nodePath or install Node.js.'
        : 'Runtime is available for the MCP server.',
    },
    {
      label: 'Bundled MCP script',
      state: scriptExists ? 'ok' : 'bad',
      value: scriptPath,
      detail: scriptExists ? 'The extension bundle can start Source Graph MCP.' : 'Reinstall the VSIX or rebuild the extension bundle.',
    },
    {
      label: 'Graph DB',
      state: dbExists ? 'ok' : 'warn',
      value: dbPath,
      detail: dbExists ? 'Workspace index exists.' : 'missing - run Agent Docs: Initialize Source Graph or Update before relying on graph results.',
    },
    {
      label: 'Codex client config',
      state: workspaceConfig.registered ? 'ok' : workspaceConfig.exists ? 'warn' : 'warn',
      value: workspaceConfig.path,
      detail: workspaceConfig.registered
        ? `Registered as ${workspaceConfig.serverName}.`
        : workspaceConfig.exists
          ? 'Config exists, but this Source Graph server is not registered.'
          : 'Codex client config file is not present.',
    },
    {
      label: 'MCP JSON config',
      state: mcpJsonConfig.registered ? 'ok' : mcpJsonConfig.exists ? 'warn' : 'warn',
      value: mcpJsonConfig.path,
      detail: mcpJsonConfig.registered
        ? `Registered as ${mcpJsonConfig.serverName}.`
        : mcpJsonConfig.exists
          ? 'Config exists, but this Source Graph server is not registered.'
          : '.mcp.json is not present.',
    },
    {
      label: 'Claude project approval',
      state: claudeStatus.state,
      value: claudeStatus.value,
      detail: claudeStatus.detail,
    },
    {
      label: 'Codex project visibility',
      state: codexStatus.state,
      value: codexStatus.value,
      detail: codexStatus.detail,
    },
    {
      label: 'Workspace skill roots',
      state: skillRoots.allPresent ? 'ok' : 'warn',
      value: skillRoots.value,
      detail: skillRoots.allPresent
        ? 'Agent skill roots exist in this workspace.'
        : 'Run Agent Docs: Install Source Graph MCP to create/update workspace skill roots.',
    },
  ];
  const configReady = workspaceConfig.registered || mcpJsonConfig.registered;
  const hardFailure = items.some((item) => item.state === 'bad');
  const overallState: SourceGraphMcpState = hardFailure ? 'bad' : configReady && dbExists ? 'ok' : 'warn';
  const model: SourceGraphMcpStatusModel = {
    workspace: workspaceFolder.uri.fsPath,
    checkedAt: new Date().toLocaleString(),
    overallState,
    headline: overallState === 'ok' ? 'MCP is ready' : overallState === 'bad' ? 'MCP cannot start yet' : 'MCP needs attention',
    summary: overallState === 'ok'
      ? 'MCP clients can load this workspace Source Graph server after a fresh trusted session.'
      : hardFailure
        ? 'Fix the red checks first, then reinstall or recheck the MCP setup.'
        : 'The core pieces are present, but a config or graph index step still needs attention.',
    configuredClients: [
      mcpJsonConfig.registered ? `Claude/generic MCP: ${mcpJsonConfig.serverName}` : '',
      workspaceConfig.registered ? `Codex: ${workspaceConfig.serverName}` : '',
    ].filter(Boolean).join(' | ') || 'No workspace MCP client config found',
    items,
  };
  openSourceGraphMcpStatusPanel(context, model);
}

type SourceGraphMcpState = 'ok' | 'warn' | 'bad';

interface SourceGraphMcpStatusItem {
  label: string;
  state: SourceGraphMcpState;
  value: string;
  detail: string;
}

interface SourceGraphMcpConfigRegistration {
  path: string;
  serverName: string;
  exists: boolean;
  registered: boolean;
}

interface SourceGraphSkillRootsStatus {
  allPresent: boolean;
  value: string;
}

interface SourceGraphMcpStatusModel {
  workspace: string;
  checkedAt: string;
  overallState: SourceGraphMcpState;
  headline: string;
  summary: string;
  configuredClients: string;
  items: SourceGraphMcpStatusItem[];
}

type SourceGraphMcpInstallTarget = 'all' | 'mcp-json' | 'codex';

interface SourceGraphMcpInstallPick extends vscode.QuickPickItem {
  target: SourceGraphMcpInstallTarget;
}

interface ClaudeMcpStatus {
  state: SourceGraphMcpState;
  value: string;
  detail: string;
}

interface CodexMcpStatus {
  state: SourceGraphMcpState;
  value: string;
  detail: string;
}

async function pickMcpInstallTarget(
  workspaceFolder: vscode.WorkspaceFolder,
  serverName: string,
  codexConfigPath: string,
  mcpJsonPath: string,
): Promise<SourceGraphMcpInstallTarget | null> {
  const codex = await inspectCodexConfigRegistration(codexConfigPath, serverName);
  const mcpJson = await inspectMcpJsonRegistration(mcpJsonPath, serverName);
  const registeredText = [
    mcpJson.registered ? 'MCP JSON already registered' : '',
    codex.registered ? 'Codex already registered' : '',
  ].filter(Boolean).join(' · ');
  const suffix = registeredText ? `Current: ${registeredText}` : 'No existing Source Graph MCP registration found.';
  const picks: SourceGraphMcpInstallPick[] = [
    {
      label: 'All supported clients',
      description: '.mcp.json + .codex/config.toml',
      detail: `Use this workspace MCP server from Claude-compatible clients and Codex. ${suffix}`,
      target: 'all',
    },
    {
      label: 'Claude / generic MCP',
      description: '.mcp.json',
      detail: `Register only the workspace .mcp.json entry. ${mcpJson.registered ? 'Already registered; this will refresh it.' : 'Claude Code and compatible MCP clients can use this.'}`,
      target: 'mcp-json',
    },
    {
      label: 'Codex',
      description: '.codex/config.toml',
      detail: `Register only the workspace Codex config entry. ${codex.registered ? 'Already registered; this will refresh it.' : 'Codex can use this after a fresh trusted workspace session.'}`,
      target: 'codex',
    },
  ];
  const picked = await vscode.window.showQuickPick(picks, {
    ignoreFocusOut: true,
    title: 'Install Source Graph MCP',
    placeHolder: `Choose which MCP client config to update for ${workspaceFolder.name}`,
  });
  return picked?.target ?? null;
}

async function inspectConfigRegistration(configPath: string, serverName: string): Promise<SourceGraphMcpConfigRegistration> {
  const text = await readTextIfExists(configPath);
  return {
    path: configPath,
    serverName,
    exists: Boolean(text),
    registered: Boolean(text) && (managedBlockPattern(serverName).test(text) || text.includes(`[mcp_servers.${serverName}]`)),
  };
}

async function inspectWorkspaceMcpSkillRoots(workspaceFolder: vscode.WorkspaceFolder): Promise<SourceGraphSkillRootsStatus> {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const roots = [
    ...workspaceMcpSkillProfiles.map((profile) => path.join(workspaceRoot, ...profile.targetPathSegments)),
    resolveWorkspaceConfiguredSkillsDir(workspaceFolder),
  ];
  const uniqueRoots = [...new Map(roots.map((rootDir) => [normalizeForCompare(rootDir), rootDir])).values()];
  const results = await Promise.all(uniqueRoots.map(async (rootDir) => ({
    rootDir,
    exists: await pathExists(rootDir),
  })));
  return {
    allPresent: results.every((result) => result.exists),
    value: results.map((result) => `${result.exists ? '[ok]' : '[missing]'} ${result.rootDir}`).join('\n'),
  };
}

function openSourceGraphMcpStatusPanel(context: vscode.ExtensionContext, model: SourceGraphMcpStatusModel): void {
  if (sourceGraphMcpStatusPanel) {
    sourceGraphMcpStatusPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    sourceGraphMcpStatusPanel = vscode.window.createWebviewPanel(
      'markdownAgentDocsSourceGraphMcpStatus',
      'Source Graph MCP Status',
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true },
    );
    sourceGraphMcpStatusPanel.onDidDispose(() => {
      sourceGraphMcpStatusPanel = null;
    }, null, context.subscriptions);
  }
  sourceGraphMcpStatusPanel.webview.html = renderSourceGraphMcpStatusHtml(sourceGraphMcpStatusPanel.webview, model);
}

function renderSourceGraphMcpStatusHtml(webview: vscode.Webview, model: SourceGraphMcpStatusModel): string {
  const rows = model.items.map((item) => `
    <article class="check ${item.state}">
      <div class="status-dot" aria-hidden="true"></div>
      <div>
        <h2>${escapeHtmlText(item.label)}</h2>
        <p>${escapeHtmlText(item.detail)}</p>
        <code>${escapeHtmlText(item.value)}</code>
      </div>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:;" />
  <title>Source Graph MCP Status</title>
  <style>
    :root { color-scheme: dark; --ok:#3fb950; --warn:#d29922; --bad:#f85149; --line:var(--vscode-panel-border, rgba(128,128,128,.24)); }
    body { margin: 0; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 1040px; margin: 0 auto; padding: 28px 32px 40px; }
    header { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: start; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
    .kicker { color: var(--vscode-textLink-foreground); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 6px 0 8px; font-size: 25px; line-height: 1.2; }
    h2 { margin: 0; font-size: 13px; line-height: 1.35; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.55; }
    code { display: block; overflow-wrap: anywhere; color: var(--vscode-textPreformat-foreground, var(--vscode-editor-foreground)); font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .badge { display: inline-flex; gap: 8px; align-items: center; justify-content: center; min-width: 142px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 999px; font-weight: 700; background: var(--vscode-editorWidget-background, rgba(128,128,128,.08)); }
    .badge .status-dot { width: 10px; height: 10px; }
    .ok .status-dot, .badge.ok .status-dot { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok), transparent 78%); }
    .warn .status-dot, .badge.warn .status-dot { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn), transparent 78%); }
    .bad .status-dot, .badge.bad .status-dot { background: var(--bad); box-shadow: 0 0 0 3px color-mix(in srgb, var(--bad), transparent 78%); }
    .status-dot { width: 11px; height: 11px; border-radius: 999px; margin-top: 3px; }
    .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 20px 0; }
    .meta-item { display: grid; gap: 5px; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .meta-item span { color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
    .check { display: grid; grid-template-columns: 18px 1fr; gap: 10px; padding: 13px; border: 1px solid var(--line); border-radius: 7px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.06)); }
    .check.ok { border-color: color-mix(in srgb, var(--ok), transparent 65%); }
    .check.warn { border-color: color-mix(in srgb, var(--warn), transparent 58%); }
    .check.bad { border-color: color-mix(in srgb, var(--bad), transparent 58%); }
    .check p { margin: 4px 0 8px; }
    .note { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
    @media (max-width: 760px) {
      main { padding: 20px; }
      header, .meta { grid-template-columns: 1fr; }
      .badge { justify-content: flex-start; width: fit-content; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="kicker">Agent Docs for Markdown</div>
        <h1>${escapeHtmlText(model.headline)}</h1>
        <p>${escapeHtmlText(model.summary)}</p>
      </div>
      <div class="badge ${model.overallState}"><span class="status-dot"></span>${escapeHtmlText(statusLabel(model.overallState))}</div>
    </header>
    <section class="meta" aria-label="MCP status scope">
      <div class="meta-item"><span>Workspace</span><code>${escapeHtmlText(model.workspace)}</code></div>
      <div class="meta-item"><span>Configured Clients</span><code>${escapeHtmlText(model.configuredClients)}</code></div>
      <div class="meta-item"><span>Checked</span><code>${escapeHtmlText(model.checkedAt)}</code></div>
    </section>
    <section class="checks" aria-label="MCP readiness checks">
      ${rows}
    </section>
    <p class="note">If MCP was just installed, restart Codex or start a new trusted workspace session before expecting the tools to appear.</p>
  </main>
</body>
</html>`;
}

function statusLabel(state: SourceGraphMcpState): string {
  if (state === 'ok') return 'Ready';
  if (state === 'bad') return 'Blocked';
  return 'Needs Attention';
}

async function removeCodexMcp(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const codexConfigPath = getCodexConfigPath(workspaceFolder, 'workspace');
  const mcpJsonPath = getWorkspaceMcpJsonPath(workspaceFolder);
  const serverName = getMcpServerName(workspaceFolder, 'workspace');
  const removedCodex = await removeManagedMcpBlock(codexConfigPath, serverName);
  const removedJson = await removeMcpJsonServer(mcpJsonPath, serverName);
  const removedPaths = [
    removedCodex ? codexConfigPath : '',
    removedJson ? mcpJsonPath : '',
  ].filter(Boolean);
  const message = removedPaths.length
    ? `Agent Docs Source Graph MCP removed from ${removedPaths.join(', ')}. Restart your MCP client or start a fresh session.`
    : `No Agent Docs Source Graph MCP registration found in ${codexConfigPath} or ${mcpJsonPath}.`;
  void vscode.window.showInformationMessage(message);
}

async function openSourceGraphPanel(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  sourceGraphWorkspaceFolder = workspaceFolder;
  const generation = ++sourceGraphRenderGeneration;

  if (!sourceGraphPanel) {
    sourceGraphPanel = vscode.window.createWebviewPanel(
      'markdownAgentDocsSourceGraph',
      'MPS Source Graph',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [workspaceFolder.uri],
      },
    );
    sourceGraphPanel.onDidDispose(() => {
      sourceGraphPanel = null;
      sourceGraphWorkspaceFolder = null;
    });
    sourceGraphPanel.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
      if (!message || typeof message !== 'object') return;
      const activeWorkspaceFolder = sourceGraphWorkspaceFolder || workspaceFolder;
      if (message.type === 'openPath' && typeof message.path === 'string') {
        void openGraphPathInViewer(activeWorkspaceFolder, message.path);
      }
      if (message.type === 'openEditorPath' && typeof message.path === 'string') {
        void openGraphPathInEditor(activeWorkspaceFolder, message.path);
      }
      if (message.type === 'openUrl' && typeof message.href === 'string') {
        void openGraphUrl(message.href);
      }
      if (message.type === 'searchGraph' && typeof message.query === 'string') {
        void respondToSourceGraphSearch(context, activeWorkspaceFolder, sourceGraphPanel?.webview, message);
      }
      if (message.type === 'refresh') {
        void openSourceGraphPanel(context);
      }
    });
  } else {
    sourceGraphPanel.reveal(vscode.ViewColumn.Beside, false);
  }

  let renderedCachedDb = false;
  try {
    const db = await readDb(context, workspaceFolder);
    renderedCachedDb = true;
    sourceGraphPanel.webview.html = renderSourceGraphHtml(db, sourceGraphPanel.webview);
  } catch {
    sourceGraphPanel.webview.html = renderSourceGraphLoadingHtml(
      sourceGraphPanel.webview,
      'Source Graph DB missing',
      'No .mps/source-graph.sqlite exists for this workspace yet. Agent Docs is creating it automatically now; if this fails, run Agent Docs: Initialize Source Graph or Check Source Graph MCP Status.',
    );
  }

  void updateSourceGraphIndex(context, workspaceFolder)
    .then((db) => {
      if (!sourceGraphPanel || generation !== sourceGraphRenderGeneration) return;
      sourceGraphPanel.webview.html = renderSourceGraphHtml(db, sourceGraphPanel.webview);
    })
    .catch((error) => {
      if (!sourceGraphPanel || generation !== sourceGraphRenderGeneration) return;
      if (!renderedCachedDb) {
        sourceGraphPanel.webview.html = renderSourceGraphLoadingHtml(
          sourceGraphPanel.webview,
          'Source Graph update failed',
          'The graph DB could not be created for this workspace. Run Agent Docs: Initialize Source Graph, or run Check Source Graph MCP Status for setup details.',
        );
      }
      void showSourceGraphError('openSourceGraph', error);
    });
}

async function searchSourceGraph(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const db = await loadOrUpdateDb(context, workspaceFolder);
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: 'Body text',
        description: 'Search inside Markdown content',
        mode: 'body' as const,
      },
      {
        label: 'File name / path',
        description: 'Search titles, filenames, and paths',
        mode: 'file' as const,
      },
    ],
    { title: 'Search Source Graph', placeHolder: 'Choose what to search' },
  );
  if (!mode) return;
  const query = await vscode.window.showInputBox({
    title: mode.mode === 'body' ? 'Search Markdown Body Text' : 'Search File Names And Paths',
    prompt: mode.mode === 'body'
      ? 'Search inside indexed Markdown files.'
      : 'Search Markdown titles, filenames, and paths.',
    placeHolder: mode.mode === 'body' ? 'revenue forecast, decision memo, ...' : 'README.md, docs/source, ...',
  });
  if (!query) return;
  const documents = mode.mode === 'body'
    ? await searchBodyDocuments(workspaceFolder, db, query, 50)
    : searchFileDocuments(db, query, 50);

  const picked = await vscode.window.showQuickPick(
    documents.map((item) => ({
      label: item.document.title || path.basename(item.document.path),
      description: item.document.path,
      detail: `${item.document.incomingCount} in · ${item.document.outgoingCount} out · ${item.document.wordCount} words`,
      document: item.document,
    })),
    { matchOnDescription: true, matchOnDetail: true, placeHolder: `Source graph results for "${query}"` },
  );
  if (!picked) return;
  await openGraphPathInViewer(workspaceFolder, picked.document.path);
}

async function respondToSourceGraphSearch(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  webview: vscode.Webview | undefined,
  message: SourceGraphWebviewMessage,
): Promise<void> {
  if (!webview) return;
  const query = String(message.query || '').trim();
  const requestId = Number(message.requestId || 0);
  const mode = message.mode === 'file' ? 'file' : 'body';
  try {
    const db = await loadOrUpdateDb(context, workspaceFolder);
    const results = mode === 'body'
      ? await searchBodyDocuments(workspaceFolder, db, query, 80)
      : searchFileDocuments(db, query, 80);
    await webview.postMessage({
      type: 'searchGraphResults',
      mode,
      query,
      requestId,
      ids: results.map((item) => item.document.id),
    });
  } catch (error) {
    await webview.postMessage({
      type: 'searchGraphResults',
      mode,
      query,
      requestId,
      ids: [],
      error: stringifyError(error),
    });
  }
}

function searchFileDocuments(
  db: SourceGraphDb,
  query: string,
  limit: number,
): Array<{ document: SourceGraphDocument; score: number }> {
  const terms = normalizeSourceGraphSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return db.tables.documents
    .map((document) => {
      const haystack = normalizeSourceGraphSearchText(`${document.title} ${document.path}`);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { document, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
    .slice(0, limit);
}

async function searchBodyDocuments(
  workspaceFolder: vscode.WorkspaceFolder,
  db: SourceGraphDb,
  query: string,
  limit: number,
): Promise<Array<{ document: SourceGraphDocument; score: number }>> {
  const terms = normalizeSourceGraphSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const root = workspaceFolder.uri.fsPath;
  const results: Array<{ document: SourceGraphDocument; score: number }> = [];
  for (const document of db.tables.documents) {
    const fullPath = resolveWorkspaceFilePath(root, document.path);
    if (!fullPath) continue;
    try {
      const source = await fs.readFile(fullPath, 'utf8');
      const haystack = normalizeSourceGraphSearchText(source);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) results.push({ document, score });
    } catch {
      // A stale index entry should not break the search UI.
    }
  }
  return results
    .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
    .slice(0, limit);
}

function resolveWorkspaceFilePath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return '';
  return resolved;
}

function normalizeSourceGraphSearchText(value: string): string {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}._/-]+/gu, ' ').trim();
}

async function openSourceIgnoreFile(): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const ignorePath = path.join(workspaceFolder.uri.fsPath, MPS_IGNORE_FILE);
  if (!await pathExists(ignorePath)) {
    await fs.writeFile(ignorePath, [
      '# Agent Docs for Markdown ignore rules',
      '# One glob per line. Examples:',
      '# .agents/**',
      '# .claude/**',
      '# raw/**',
      '# **/drafts/**',
      '# *.draft.md',
      '',
    ].join('\n'), 'utf8');
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(ignorePath));
  await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
}

async function updateSourceGraphIndex(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<SourceGraphDb> {
  const scriptPath = resolveSourceGraphScriptPath(context);
  await assertSourceGraphPreflight(scriptPath, workspaceFolder);
  await spawnNodeScript(readNodePath(), [scriptPath, 'update', '--root', workspaceFolder.uri.fsPath, '--json'], workspaceFolder.uri.fsPath);
  return readDb(context, workspaceFolder);
}

async function updateSourceGraphFile(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  uri: vscode.Uri,
): Promise<SourceGraphDb> {
  const scriptPath = resolveSourceGraphScriptPath(context);
  await assertSourceGraphPreflight(scriptPath, workspaceFolder);
  const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
  await spawnNodeScript(
    readNodePath(),
    [scriptPath, 'update-file', '--root', workspaceFolder.uri.fsPath, '--path', relativePath, '--json'],
    workspaceFolder.uri.fsPath,
  );
  return readDb(context, workspaceFolder);
}

async function loadOrUpdateDb(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<SourceGraphDb> {
  try {
    return await readDb(context, workspaceFolder);
  } catch {
    return updateSourceGraphIndex(context, workspaceFolder);
  }
}

async function readDb(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): Promise<SourceGraphDb> {
  const sqliteModulePath = path.join(context.extensionPath, 'public', 'core', 'source-graph-sqlite.js');
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{
    readSourceGraphWebviewSqlite: (dbPath: string) => Promise<SourceGraphDb>;
  }>;
  const sqlite = await dynamicImport(pathToFileURL(sqliteModulePath).href);
  return sqlite.readSourceGraphWebviewSqlite(getDbPath(workspaceFolder));
}

function getDbPath(workspaceFolder: vscode.WorkspaceFolder): string {
  return path.join(workspaceFolder.uri.fsPath, DB_RELATIVE_PATH);
}

function resolveSourceGraphScriptPath(context: vscode.ExtensionContext): string {
  const bundled = path.join(context.extensionPath, 'scripts', 'source-graph.mjs');
  return bundled;
}

function readNodePath(): string {
  const raw = vscode.workspace.getConfiguration('markdownAgentDocs').get<string>('nodePath', 'node');
  return String(raw || 'node').trim() || 'node';
}

class SourceGraphUserError extends Error {
  constructor(
    message: string,
    readonly causeText: string,
    readonly fixText: string,
    readonly detailText = '',
  ) {
    super(message);
  }
}

async function assertSourceGraphPreflight(scriptPath: string, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!await pathExists(scriptPath)) {
    throw new SourceGraphUserError(
      'Bundled Source Graph MCP script is missing.',
      `The extension could not find scripts/source-graph.mjs at ${scriptPath}.`,
      'Reinstall the latest VSIX. If you are running from source, run npm run build in vscode-extension so the bundled scripts are copied.',
    );
  }
  try {
    await spawnCapture(readNodePath(), ['--version'], workspaceFolder.uri.fsPath);
  } catch (error) {
    throw new SourceGraphUserError(
      'Node.js is not available to run Source Graph.',
      `The configured Node command "${readNodePath()}" could not be executed.`,
      'Install Node.js, or set VS Code setting markdownAgentDocs.nodePath to the absolute path of node.exe, then retry the command.',
      stringifyError(error),
    );
  }
}

async function showSourceGraphError(command: string, error: unknown): Promise<void> {
  const diagnosis = diagnoseSourceGraphError(command, error);
  const action = await vscode.window.showErrorMessage(
    `${diagnosis.title}: ${diagnosis.cause}`,
    'Show Details',
    'Check Status',
  );
  if (action === 'Check Status') {
    await vscode.commands.executeCommand('markdownAgentDocs.checkCodexMcpStatus');
    return;
  }
  if (action !== 'Show Details') return;
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      '# Agent Docs Source Graph Error',
      '',
      `- Command: \`${command}\``,
      `- Cause: ${diagnosis.cause}`,
      `- Fix: ${diagnosis.fix}`,
      '',
      '## Technical Details',
      '',
      '```text',
      diagnosis.detail || '(no additional details)',
      '```',
      '',
      '## Next Checks',
      '',
      '- Run `Agent Docs: Check Source Graph MCP Status`.',
      '- Confirm Node.js is installed and `markdownAgentDocs.nodePath` is correct.',
      '- Confirm the workspace is trusted in Codex if you installed workspace `.codex/config.toml`.',
      '- Re-run `Agent Docs: Install Source Graph MCP` after fixing the issue.',
      '',
    ].join('\n'),
  });
  await vscode.window.showTextDocument(document, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

function diagnoseSourceGraphError(command: string, error: unknown): { title: string; cause: string; fix: string; detail: string } {
  if (error instanceof SourceGraphUserError) {
    return { title: 'Source Graph setup failed', cause: error.causeText, fix: error.fixText, detail: error.detailText || error.stack || error.message };
  }
  const detail = stringifyError(error);
  const lower = detail.toLowerCase();
  if (lower.includes('enoent') && (lower.includes('node') || lower.includes('spawn'))) {
    return {
      title: 'Source Graph setup failed',
      cause: 'Node.js could not be found or launched.',
      fix: 'Install Node.js, or set markdownAgentDocs.nodePath to the absolute path of node.exe, then retry.',
      detail,
    };
  }
  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission')) {
    return {
      title: 'Source Graph setup failed',
      cause: 'VS Code does not have permission to write the graph DB or Codex config file.',
      fix: 'Check workspace folder permissions, close apps locking the file, then retry the workspace MCP install.',
      detail,
    };
  }
  if (lower.includes('json') || lower.includes('unexpected token')) {
    return {
      title: 'Source Graph setup failed',
      cause: 'The existing source graph database appears to be corrupt or partially written.',
      fix: 'Delete `.mps/source-graph.sqlite` and run `Agent Docs: Update Source Graph` again.',
      detail,
    };
  }
  if (lower.includes('trusted')) {
    return {
      title: 'Source Graph MCP may not load',
      cause: 'Project-scoped `.codex/config.toml` only loads for trusted Codex workspaces.',
      fix: 'Trust this workspace in Codex, or reinstall MCP into user `~/.codex/config.toml`.',
      detail,
    };
  }
  return {
    title: 'Source Graph command failed',
    cause: 'The command did not complete successfully.',
    fix: 'Run `Agent Docs: Check Source Graph MCP Status`, review the technical details, then retry the command.',
    detail,
  };
}

type CodexConfigScope = 'workspace' | 'user';

async function ensureWorkspaceMcpSkillFolders(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<string[]> {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const prepared = new Map<string, string>();
  const addPrepared = (rootDir: string, label: string) => {
    prepared.set(normalizeForCompare(rootDir), `${label}: ${rootDir}`);
  };

  for (const profile of workspaceMcpSkillProfiles) {
    const sourceDir = await resolveBundledSkillRoot(context, profile.sourcePathSegments);
    if (!sourceDir) continue;
    const targetDir = path.join(workspaceRoot, ...profile.targetPathSegments);
    await syncBundledSkillRoot(sourceDir, targetDir);
    addPrepared(targetDir, profile.label);
  }

  const configuredSkillsDir = resolveWorkspaceConfiguredSkillsDir(workspaceFolder);
  const claudeSourceDir = await resolveBundledSkillRoot(context, ['ai_skills', 'claude', 'skills']);
  if (configuredSkillsDir && claudeSourceDir) {
    await syncBundledSkillRoot(claudeSourceDir, configuredSkillsDir);
    addPrepared(configuredSkillsDir, 'Configured skillsDir');
  }

  return [...prepared.values()];
}

async function resolveBundledSkillRoot(context: vscode.ExtensionContext, segments: readonly string[]): Promise<string | null> {
  return firstExistingDirectory([
    path.join(context.extensionPath, ...segments),
    path.resolve(context.extensionPath, '..', ...segments),
  ]);
}

function resolveWorkspaceConfiguredSkillsDir(workspaceFolder: vscode.WorkspaceFolder): string {
  const raw = String(vscode.workspace.getConfiguration('markdownAgentDocs').get<string>('skillsDir', 'claude_skills/skills') || '').trim();
  const value = raw || 'claude_skills/skills';
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const expanded = value.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.join(workspaceRoot, expanded);
}

async function syncBundledSkillRoot(sourceRoot: string, targetRoot: string): Promise<void> {
  const sourceEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  await fs.mkdir(targetRoot, { recursive: true });
  for (const entry of sourceEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (SKILL_COPY_EXCLUDED_NAMES.has(entry.name)) continue;

    const sourceSkillDir = path.join(sourceRoot, entry.name);
    if (!await isFile(path.join(sourceSkillDir, 'SKILL.md'))) continue;

    const targetSkillDir = path.join(targetRoot, entry.name);
    assertInsideDirectory(targetRoot, targetSkillDir);
    if (isSameOrInside(targetSkillDir, sourceSkillDir) || isSameOrInside(sourceSkillDir, targetSkillDir)) {
      throw new Error(`Refusing to sync ${entry.name}: source and target overlap.`);
    }

    await fs.mkdir(targetSkillDir, { recursive: true });
    await clearDirectoryContents(targetSkillDir);
    await fs.cp(sourceSkillDir, targetSkillDir, {
      recursive: true,
      force: true,
      filter: (sourcePath) => !SKILL_COPY_EXCLUDED_NAMES.has(path.basename(sourcePath)),
    });
  }
}

async function clearDirectoryContents(targetDir: string): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKILL_COPY_EXCLUDED_NAMES.has(entry.name) || entry.isSymbolicLink()) continue;
    await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function getCodexConfigPath(workspaceFolder: vscode.WorkspaceFolder, scope: CodexConfigScope): string {
  if (scope === 'workspace') return path.join(workspaceFolder.uri.fsPath, '.codex', 'config.toml');
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function getWorkspaceMcpJsonPath(workspaceFolder: vscode.WorkspaceFolder): string {
  return path.join(workspaceFolder.uri.fsPath, '.mcp.json');
}

function getMcpServerName(workspaceFolder: vscode.WorkspaceFolder, scope: CodexConfigScope): string {
  if (scope === 'workspace') return 'markdown_pattern_studio_source_graph';
  return `markdown_pattern_studio_source_graph_${hashText(workspaceFolder.uri.fsPath)}`;
}

async function resolveMcpNodeCommand(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  const configured = readNodePath();
  if (path.isAbsolute(configured)) return configured;
  try {
    const resolved = await spawnCapture(configured, ['-p', 'process.execPath'], workspaceFolder.uri.fsPath);
    const firstLine = resolved.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (firstLine && path.isAbsolute(firstLine)) return firstLine;
  } catch {
    // Fall back to the configured command; status diagnostics will surface launch failures.
  }
  return configured;
}

function buildMcpTomlBlock(serverName: string, nodeCommand: string, scriptPath: string, root: string, managed: boolean): string {
  const lines = [
    `[mcp_servers.${serverName}]`,
    `command = "${escapeTomlString(nodeCommand)}"`,
    `args = ["${escapeTomlString(scriptPath)}", "mcp", "--root", "${escapeTomlString(root)}"]`,
    `cwd = "${escapeTomlString(root)}"`,
    'startup_timeout_sec = 20',
    'tool_timeout_sec = 60',
    'enabled = true',
  ];
  if (!managed) return `${lines.join('\n')}\n`;
  return [
    `# BEGIN Agent Docs Source Graph MCP: ${serverName}`,
    ...lines,
    `# END Agent Docs Source Graph MCP: ${serverName}`,
    '',
  ].join('\n');
}

function buildMcpJsonConfig(serverName: string, nodeCommand: string, scriptPath: string, root: string): Record<string, unknown> {
  return {
    mcpServers: {
      [serverName]: buildMcpJsonServer(nodeCommand, scriptPath, root),
    },
  };
}

function buildMcpJsonServer(nodeCommand: string, scriptPath: string, root: string): Record<string, unknown> {
  return {
    type: 'stdio',
    command: nodeCommand,
    args: [scriptPath, 'mcp', '--root', root],
    cwd: root,
  };
}

async function upsertManagedMcpBlock(configPath: string, serverName: string, nodeCommand: string, scriptPath: string, root: string): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const nextBlock = buildMcpTomlBlock(serverName, nodeCommand, scriptPath, root, true);
  const prepared = managedBlockPattern(serverName).test(existing)
    ? existing
    : removeUnmanagedMcpServerTables(existing, serverName);
  const next = replaceManagedBlock(prepared, serverName, nextBlock);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  let backupPath = '';
  if (existing.trim()) {
    backupPath = `${configPath}.bak-${timestampForPath()}`;
    await fs.writeFile(backupPath, existing, 'utf8');
  }
  await fs.writeFile(configPath, next, 'utf8');
  return backupPath;
}

async function upsertMcpJsonServer(configPath: string, serverName: string, nodeCommand: string, scriptPath: string, root: string): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const config = parseMcpJsonConfig(existing, configPath);
  const mcpServers = normalizeObject(config.mcpServers);
  mcpServers[serverName] = buildMcpJsonServer(nodeCommand, scriptPath, root);
  config.mcpServers = mcpServers;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  let backupPath = '';
  if (existing.trim()) {
    backupPath = `${configPath}.bak-${timestampForPath()}`;
    await fs.writeFile(backupPath, existing, 'utf8');
  }
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return backupPath;
}

async function removeManagedMcpBlock(configPath: string, serverName: string): Promise<boolean> {
  const existing = await readTextIfExists(configPath);
  if (!existing) return false;
  const pattern = managedBlockPattern(serverName);
  if (!pattern.test(existing)) return false;
  const next = existing.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  await fs.writeFile(configPath, next ? `${next}\n` : '', 'utf8');
  return true;
}

async function removeMcpJsonServer(configPath: string, serverName: string): Promise<boolean> {
  const existing = await readTextIfExists(configPath);
  if (!existing.trim()) return false;
  const config = parseMcpJsonConfig(existing, configPath);
  const mcpServers = normalizeObject(config.mcpServers);
  if (!Object.prototype.hasOwnProperty.call(mcpServers, serverName)) return false;
  delete mcpServers[serverName];
  config.mcpServers = mcpServers;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return true;
}

function replaceManagedBlock(existing: string, serverName: string, nextBlock: string): string {
  const normalized = existing.replace(/\s+$/g, '');
  const pattern = managedBlockPattern(serverName);
  if (pattern.test(normalized)) return `${normalized.replace(pattern, nextBlock.trimEnd())}\n`;
  return `${normalized ? `${normalized}\n\n` : ''}${nextBlock}`;
}

function managedBlockPattern(serverName: string): RegExp {
  const escaped = escapeRegExp(serverName);
  return new RegExp(`# BEGIN Agent Docs Source Graph MCP: ${escaped}\\n[\\s\\S]*?# END Agent Docs Source Graph MCP: ${escaped}\\n?`, 'm');
}

function removeUnmanagedMcpServerTables(existing: string, serverName: string): string {
  const lines = existing.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.trim().match(/^\[([^\]]+)\]$/)?.[1] || '';
    if (header) {
      const isTarget = header === `mcp_servers.${serverName}` || header.startsWith(`mcp_servers.${serverName}.`);
      if (isTarget) {
        skipping = true;
        continue;
      }
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

async function describeConfigRegistration(configPath: string, serverName: string): Promise<string> {
  const text = await readTextIfExists(configPath);
  if (!text) return `${configPath} (not found)`;
  return managedBlockPattern(serverName).test(text) || text.includes(`[mcp_servers.${serverName}]`)
    ? `${configPath} (registered as ${serverName})`
    : `${configPath} (not registered)`;
}

async function inspectCodexConfigRegistration(configPath: string, serverName: string): Promise<SourceGraphMcpConfigRegistration> {
  const text = await readTextIfExists(configPath);
  return {
    path: configPath,
    serverName,
    exists: Boolean(text),
    registered: Boolean(text) && (managedBlockPattern(serverName).test(text) || text.includes(`[mcp_servers.${serverName}]`)),
  };
}

async function inspectMcpJsonRegistration(configPath: string, serverName: string): Promise<SourceGraphMcpConfigRegistration> {
  const text = await readTextIfExists(configPath);
  if (!text.trim()) {
    return { path: configPath, serverName, exists: false, registered: false };
  }
  try {
    const config = parseMcpJsonConfig(text, configPath);
    const mcpServers = normalizeObject(config.mcpServers);
    return {
      path: configPath,
      serverName,
      exists: true,
      registered: Object.prototype.hasOwnProperty.call(mcpServers, serverName),
    };
  } catch {
    return { path: configPath, serverName, exists: true, registered: false };
  }
}

async function inspectClaudeMcpStatus(
  workspaceFolder: vscode.WorkspaceFolder,
  serverName: string,
  mcpJsonRegistered: boolean,
): Promise<ClaudeMcpStatus> {
  if (!mcpJsonRegistered) {
    return {
      state: 'warn',
      value: 'No .mcp.json registration found.',
      detail: 'Choose Claude / generic MCP or All supported clients from Install Source Graph MCP.',
    };
  }
  try {
    const output = await spawnCapture('claude', ['mcp', 'list'], workspaceFolder.uri.fsPath);
    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.includes(serverName));
    if (!line) {
      return {
        state: 'warn',
        value: 'Claude CLI did not list this project server.',
        detail: 'Reload Claude Code or run `claude mcp list` from the workspace root.',
      };
    }
    if (/pending approval/i.test(line)) {
      return {
        state: 'warn',
        value: line,
        detail: 'Claude Code discovered the project MCP but needs approval. Open Claude Code in this workspace and approve it from /mcp, or run `claude` in this folder to approve project MCP choices.',
      };
    }
    if (/connected/i.test(line)) {
      return {
        state: 'ok',
        value: line,
        detail: 'Claude Code can connect to the Source Graph MCP server.',
      };
    }
    return {
      state: 'warn',
      value: line,
      detail: 'Claude Code listed the server, but it is not connected yet. Check /mcp for approval or connection details.',
    };
  } catch (error) {
    return {
      state: 'warn',
      value: 'Claude CLI status unavailable.',
      detail: `Install Claude Code CLI or run /mcp in Claude Code. ${errorToShortText(error)}`,
    };
  }
}

async function inspectCodexMcpStatus(
  workspaceFolder: vscode.WorkspaceFolder,
  serverName: string,
  codexRegistered: boolean,
): Promise<CodexMcpStatus> {
  if (!codexRegistered) {
    return {
      state: 'warn',
      value: 'No Codex project config registration found.',
      detail: 'Choose Codex or All supported clients from Install Source Graph MCP.',
    };
  }
  try {
    const output = await spawnCapture('codex', ['mcp', 'get', serverName], workspaceFolder.uri.fsPath);
    if (output.toLowerCase().includes(serverName.toLowerCase())) {
      return {
        state: 'ok',
        value: 'Codex CLI can see this project MCP from the workspace root.',
        detail: 'The desktop MCP panel shows project-scoped servers only after a fresh trusted Codex session is opened for this exact workspace.',
      };
    }
    return {
      state: 'warn',
      value: 'Codex CLI did not list this project server.',
      detail: 'Restart Codex in this workspace, or check that the workspace is trusted and .codex/config.toml is in the workspace root.',
    };
  } catch (error) {
    return {
      state: 'warn',
      value: 'Codex CLI status unavailable or server not loaded in this folder.',
      detail: `Open a fresh trusted Codex session for this workspace, then check the MCP panel. ${errorToShortText(error)}`,
    };
  }
}

function parseMcpJsonConfig(source: string, configPath: string): Record<string, unknown> {
  if (!source.trim()) return {};
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new SourceGraphUserError(
      'Workspace MCP JSON config is invalid.',
      `${configPath} could not be parsed as JSON.`,
      'Fix or delete the invalid .mcp.json file, then rerun Agent Docs: Install Source Graph MCP.',
      stringifyError(error),
    );
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function firstExistingDirectory(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return path.normalize(candidate);
    } catch {
      // Try the next bundled location.
    }
  }
  return null;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function assertInsideDirectory(parentPath: string, candidatePath: string): void {
  if (!isSameOrInside(candidatePath, parentPath)) {
    throw new Error(`Refusing to write outside target skill root: ${candidatePath}`);
  }
}

function isSameOrInside(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidate = normalizeForCompare(candidatePath);
  const normalizedParent = normalizeForCompare(parentPath);
  const relative = path.relative(normalizedParent, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkNodeAvailable(): Promise<string> {
  try {
    const output = await spawnCapture(readNodePath(), ['--version'], process.cwd());
    return output.trim() || 'available';
  } catch (error) {
    return `not available: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function spawnCapture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error((stderr || stdout).trim() || `${command} exited with ${code}`));
    });
  });
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function errorToShortText(error: unknown): string {
  const text = stringifyError(error).replace(/\s+/g, ' ').trim();
  return text ? `Details: ${text.slice(0, 220)}` : '';
}

function spawnNodeScript(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error((stderr || stdout).trim() || `source graph exited with ${code}`));
    });
  });
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | null> {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) {
    void vscode.window.showErrorMessage('Open a workspace folder before using Source Graph.');
    return null;
  }
  if (folders.length === 1) return folders[0];
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Choose a workspace for the source graph.' },
  );
  return picked?.folder ?? null;
}

function resolveWorkspaceRelativeFile(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): vscode.Uri | null {
  const cleanPath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleanPath || /^[a-z][a-z0-9+.-]*:/i.test(cleanPath)) return null;
  const targetPath = path.normalize(path.join(workspaceFolder.uri.fsPath, cleanPath));
  const relative = path.relative(workspaceFolder.uri.fsPath, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    void vscode.window.showWarningMessage(`Refusing to open path outside workspace: ${relativePath}`);
    return null;
  }
  return vscode.Uri.file(targetPath);
}

async function openGraphPathInViewer(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
  const uri = resolveWorkspaceRelativeFile(workspaceFolder, relativePath);
  if (!uri) return;
  await vscode.commands.executeCommand('markdownAgentDocs.openFileInViewer', uri);
}

async function openGraphPathInEditor(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
  const uri = resolveWorkspaceRelativeFile(workspaceFolder, relativePath);
  if (!uri) return;
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
}

async function openGraphUrl(href: string): Promise<void> {
  const value = href.trim();
  if (!value) return;
  let uri: vscode.Uri;
  try {
    uri = vscode.Uri.parse(value);
  } catch {
    void vscode.window.showWarningMessage(`Could not open Source Graph URL: ${href}`);
    return;
  }
  if (!['http', 'https'].includes(uri.scheme.toLowerCase())) {
    void vscode.window.showWarningMessage(`Source Graph only opens http/https URLs: ${href}`);
    return;
  }
  try {
    await vscode.commands.executeCommand('simpleBrowser.show', value);
  } catch {
    await vscode.env.openExternal(uri);
  }
}

async function scheduleWorkspaceGraphRefresh(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  mode: 'file' | 'full',
  force = false,
): Promise<void> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return;
  if (!force && await isSourceIgnoredUri(uri)) return;
  try {
    await fs.access(getDbPath(workspaceFolder));
  } catch {
    return;
  }
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const update =
      mode === 'file'
        ? updateSourceGraphFile(context, workspaceFolder, uri).catch(() => updateSourceGraphIndex(context, workspaceFolder))
        : updateSourceGraphIndex(context, workspaceFolder);
    void update.then((db) => {
      if (sourceGraphPanel) sourceGraphPanel.webview.html = renderSourceGraphHtml(db, sourceGraphPanel.webview);
    });
  }, 600);
}

function renderSourceGraphLoadingHtml(webview: vscode.Webview, title: string, detail: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <title>MPS Source Graph</title>
  <style>
    :root { color-scheme: dark; --bg:#080c13; --panel:#101827; --line:rgba(154,171,195,.18); --text:#e8eef9; --muted:#9aabc3; --accent:#7ea0ff; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text); font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .card { width:min(460px, calc(100vw - 32px)); display:grid; gap:10px; padding:18px; border:1px solid var(--line); border-radius:8px; background:rgba(16,24,39,.82); }
    .kicker { color:var(--accent); font-size:11px; font-weight:800; text-transform:uppercase; }
    strong { display:block; }
    small { display:block; color:var(--muted); line-height:1.45; }
    .bar { height:4px; overflow:hidden; border-radius:999px; background:rgba(154,171,195,.14); }
    .bar i { display:block; width:38%; height:100%; border-radius:999px; background:var(--accent); animation:loadSlide 1.1s ease-in-out infinite alternate; }
    @keyframes loadSlide { from { transform:translateX(-18%); opacity:.65; } to { transform:translateX(180%); opacity:1; } }
  </style>
</head>
<body>
  <div class="card">
    <span class="kicker">Source Graph</span>
    <strong>${escapeHtmlText(title)}</strong>
    <small>${escapeHtmlText(detail)}</small>
    <div class="bar"><i></i></div>
  </div>
</body>
</html>`;
}

function renderSourceGraphHtml(db: SourceGraphDb, webview: vscode.Webview): string {
  const nonce = createNonce();
  const json = JSON.stringify(toWebviewSourceGraphDb(db)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>MPS Source Graph</title>
  <style>
    :root { color-scheme: dark; --bg:#080c13; --panel:#101827; --line:rgba(154,171,195,.18); --text:#e8eef9; --muted:#9aabc3; --accent:#7ea0ff; }
    * { box-sizing: border-box; }
    body { margin:0; overflow:hidden; background:var(--bg); color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
    .shell { height:100vh; display:grid; grid-template-rows:auto minmax(0,1fr); }
    header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border-bottom:1px solid var(--line); background:rgba(16,24,39,.94); }
    strong, small { display:block; }
    small { margin-top:3px; color:var(--muted); }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .search-tools { display:flex; gap:6px; align-items:center; min-width:min(520px,52vw); }
    .search-mode { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px; padding:2px; border:1px solid var(--line); border-radius:8px; background:#0b111c; }
    .search-mode button { min-width:52px; padding:6px 8px; border-color:transparent; border-radius:6px; color:var(--muted); background:transparent; }
    .search-mode button[aria-pressed="true"] { color:var(--text); border-color:rgba(126,160,255,.55); background:rgba(126,160,255,.16); }
    .search-status { min-width:70px; color:var(--muted); font-size:11px; white-space:nowrap; }
    input { width:min(320px,42vw); min-width:160px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:#0b111c; color:var(--text); outline:none; }
    button { border:1px solid var(--line); border-radius:8px; padding:8px 10px; background:rgba(255,255,255,.04); color:var(--text); cursor:pointer; }
    button:hover { border-color:var(--accent); }
    button[aria-pressed="true"] { border-color:var(--accent); background:rgba(126,160,255,.16); }
    .layer-toggle[aria-pressed="true"] { border-color:var(--accent); background:rgba(126,160,255,.16); }
    .layer-toggle.url[aria-pressed="true"] { border-color:#5fc4a8; background:rgba(95,196,168,.15); }
    .layer-toggle.image[aria-pressed="true"] { border-color:#c69cff; background:rgba(198,156,255,.15); }
    .layer-toggle.missing[aria-pressed="true"] { border-color:#ff8f8f; background:rgba(255,143,143,.14); }
    .button-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .button-row button { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .button-row .wide { grid-column:1 / -1; }
    .link-toolbar { display:grid; gap:8px; }
    .link-tabs { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; align-items:center; }
    .link-tab, .link-action { padding:5px 7px; border-radius:7px; font-size:11px; line-height:1.1; }
    .link-tab { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .link-tab { color:var(--muted); }
    .link-tab[aria-pressed="true"] { color:var(--text); }
    .link-controls { display:grid; grid-template-columns:minmax(74px,auto) minmax(0,1fr); gap:8px; align-items:center; }
    .link-action { color:var(--muted); }
    .link-pager { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; color:var(--muted); font-size:11px; }
    .link-pager span { min-width:0; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .link-pager button { padding:5px 7px; border-radius:7px; font-size:11px; }
    .link-pager button:disabled { opacity:.45; cursor:default; }
    .link-summary { color:var(--muted); font-size:11px; }
    .row.compact { grid-template-columns:minmax(0,1fr) auto; gap:6px; align-items:center; }
    .row.compact small { text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    main { min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 330px; }
    svg { width:100%; height:100%; cursor:grab; touch-action:none; background:linear-gradient(rgba(154,171,195,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(154,171,195,.035) 1px,transparent 1px); background-size:34px 34px; }
    svg.dragging { cursor:grabbing; }
    aside { min-width:0; overflow:auto; border-left:1px solid var(--line); background:rgba(16,24,39,.72); padding:12px; display:grid; align-content:start; gap:12px; }
    .block { display:grid; gap:8px; padding-bottom:12px; border-bottom:1px solid var(--line); }
    .block:last-child { border-bottom:0; }
    .kicker { color:var(--accent); font-size:11px; font-weight:800; text-transform:uppercase; }
    .row { display:grid; gap:3px; padding:8px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.025); }
    .row[data-open-path], .row[data-open-url] { cursor:pointer; }
    .row[data-open-path]:hover, .row[data-open-url]:hover { border-color:var(--accent); background:rgba(126,160,255,.08); }
    .row.is-focused { border-color:#dbe6ff; background:rgba(126,160,255,.14); box-shadow:0 0 0 1px rgba(126,160,255,.28) inset; }
    .row span, .row small, .block strong, .block small { overflow-wrap:anywhere; }
    line { stroke:rgba(154,171,195,.52); stroke-width:1.2; }
    line.layer-file { stroke:rgba(154,171,195,.58); }
    line.layer-url { stroke:rgba(95,196,168,.62); stroke-dasharray:6 4; }
    line.layer-image { stroke:rgba(198,156,255,.68); stroke-dasharray:3 4; }
    line.layer-missing { stroke:rgba(255,143,143,.75); stroke-dasharray:7 5; }
    line.highlighted { stroke:#dbe6ff; stroke-width:2.8; filter:drop-shadow(0 0 5px rgba(126,160,255,.75)); }
    line.pulse { animation: edgePulse .7s ease-in-out infinite alternate; }
    line.unresolved { stroke-dasharray:5 5; }
    g.node { cursor:pointer; }
    g.node circle { fill:#182237; stroke:rgba(126,160,255,.7); stroke-width:1.4; }
    g.node.external circle { fill:#1c2e2e; stroke:rgba(95,196,168,.72); }
    g.node.unresolved circle { fill:#382226; stroke:rgba(255,143,143,.7); }
    g.node.url circle { fill:#102b28; stroke:#5fc4a8; }
    g.node.image circle { fill:#241934; stroke:#c69cff; }
    g.node.missing circle { fill:#382226; stroke:#ff8f8f; }
    g.node.selected circle, g.node:hover circle { fill:#36528f; stroke:#dbe6ff; }
    g.node.related circle { stroke:#f6d67a; stroke-width:2.2; filter:drop-shadow(0 0 7px rgba(246,214,122,.72)); }
    g.node.pulse circle { animation: nodePulse .7s ease-in-out infinite alternate; }
    g.node text { fill:#dce6f8; font-size:10.5px; paint-order:stroke; stroke:rgba(8,12,19,.86); stroke-width:3px; stroke-linejoin:round; }
    .hint { color:var(--muted); font-size:11px; }
    .legend { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 10px; color:var(--muted); font-size:11px; }
    .legend span { display:flex; align-items:center; gap:6px; min-width:0; }
    .stage { display:grid; gap:7px; color:var(--muted); }
    .stage strong { color:var(--text); }
    .stage .bar { height:4px; overflow:hidden; border-radius:999px; background:rgba(154,171,195,.14); }
    .stage .bar i { display:block; width:38%; height:100%; border-radius:999px; background:var(--accent); animation: loadSlide 1.1s ease-in-out infinite alternate; }
    .stage-list { display:grid; gap:6px; }
    .stage-item { display:grid; grid-template-columns:72px minmax(0,1fr) auto; gap:7px; align-items:center; color:var(--muted); font-size:11px; }
    .stage-item .dot { width:7px; height:7px; border-radius:50%; background:rgba(154,171,195,.45); }
    .stage-item strong { color:var(--text); font-size:11px; }
    .stage-item.done .dot { background:#5fc4a8; }
    .stage-item.running .dot { background:var(--accent); animation: nodePulse .7s ease-in-out infinite alternate; }
    .stage-item.pending .dot { background:rgba(154,171,195,.32); }
    .stage-item span:last-child { text-transform:uppercase; font-weight:800; letter-spacing:0; }
    .swatch { width:10px; height:10px; border-radius:50%; border:1px solid rgba(255,255,255,.24); flex:0 0 auto; }
    .swatch.file { background:#182237; border-color:rgba(126,160,255,.7); }
    .swatch.url { background:#102b28; border-color:#5fc4a8; }
    .swatch.image { background:#241934; border-color:#c69cff; }
    .swatch.missing { background:#382226; border-color:#ff8f8f; }
    .cluster-fill { fill:color-mix(in srgb, var(--cluster) 11%, transparent); stroke:color-mix(in srgb, var(--cluster) 68%, transparent); stroke-width:1.5; cursor:zoom-in; }
    .cluster-hull.active .cluster-fill,
    .cluster-hull:hover .cluster-fill { fill:color-mix(in srgb, var(--cluster) 18%, transparent); stroke:var(--cluster); stroke-width:2.2; }
    .cluster-label { fill:var(--cluster); font-size:11px; font-weight:750; paint-order:stroke; stroke:rgba(8,12,19,.9); stroke-width:4px; stroke-linejoin:round; pointer-events:none; }
    @keyframes nodePulse { from { stroke-width:2; filter:drop-shadow(0 0 3px rgba(246,214,122,.45)); } to { stroke-width:3.2; filter:drop-shadow(0 0 12px rgba(246,214,122,.95)); } }
    @keyframes edgePulse { from { stroke-opacity:.72; } to { stroke-opacity:1; filter:drop-shadow(0 0 10px rgba(126,160,255,1)); } }
    @keyframes loadSlide { from { transform:translateX(-18%); opacity:.65; } to { transform:translateX(180%); opacity:1; } }
    @media (max-width: 860px) { main { grid-template-columns:1fr; grid-template-rows:minmax(320px,1fr) 260px; } aside { border-left:0; border-top:1px solid var(--line); } input { width:100%; } header { align-items:flex-start; flex-direction:column; } .actions { width:100%; justify-content:flex-start; } .search-tools { width:100%; min-width:0; flex-wrap:wrap; } .search-tools input { flex:1 1 180px; } .search-status { min-width:0; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <strong>Markdown Source Graph</strong>
        <small id="meta"></small>
      </div>
      <div class="actions">
        <div class="search-tools" role="search">
          <div class="search-mode" role="group" aria-label="Search mode">
            <button id="searchBodyMode" type="button" aria-pressed="true" title="Search inside Markdown body text">Body</button>
            <button id="searchFileMode" type="button" aria-pressed="false" title="Search titles, file names, and paths">File</button>
          </div>
          <input id="search" type="search" placeholder="Search body text..." aria-label="Search Source Graph body text" />
          <span id="searchStatus" class="search-status" aria-live="polite"></span>
        </div>
        <button id="layerUrl" class="layer-toggle url" type="button" aria-pressed="false" title="Show external URL nodes">URLs</button>
        <button id="layerImage" class="layer-toggle image" type="button" aria-pressed="false" title="Show image/asset links" aria-label="Show image and asset links">Img</button>
        <button id="layerMissing" class="layer-toggle missing" type="button" aria-pressed="false" title="Show unresolved links" aria-label="Show unresolved links">Miss</button>
        <button id="toggleGroups" type="button" aria-pressed="false" title="Show folder group regions" aria-label="Show folder groups">Grp</button>
        <button id="fit" type="button">Fit</button>
        <button id="settle" type="button">Settle</button>
        <button id="refresh" type="button" title="Update Source Graph">Sync</button>
      </div>
    </header>
    <main>
      <svg id="graph" role="img" aria-label="Markdown source graph"></svg>
      <aside id="details"><div class="block stage"><span class="kicker">Booting cached graph</span><strong>Preparing Markdown files...</strong><small>Opening the Markdown-only graph first. Use URLs, Images, Missing, or Groups when you want extra layers.</small><div class="bar"><i></i></div></div></aside>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function showEarlyBootFailure(error) {
      const detailsEl = document.getElementById('details');
      const graphEl = document.getElementById('graph');
      const message = error && (error.stack || error.message || String(error)) || 'Unknown webview error';
      if (detailsEl) detailsEl.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + String(message).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])) + '</small><div class="hint">Close this tab and run Agent Docs: Open Source Graph again. If it repeats, run Agent Docs: Check Source Graph MCP Status.</div></div>';
      if (graphEl) graphEl.innerHTML = '';
    }
    window.addEventListener('error', (event) => showEarlyBootFailure(event.error || event.message));
    window.addEventListener('unhandledrejection', (event) => showEarlyBootFailure(event.reason));
    const db = ${json};
    const documentNodeIds = new Set((db.tables.documents || []).map((doc) => doc.id));
    const documentNodes = (db.graph.nodes || []).filter((node) => documentNodeIds.has(node.id)).map((node) => ({ ...node, kind: 'document', layer: 'file' }));
    const rawFileEdges = (db.graph.edges || []).filter((edge) => documentNodeIds.has(edge.source) && documentNodeIds.has(edge.target));
    const fileEdges = Array.from(rawFileEdges.reduce((map, edge) => {
      const key = edge.source + '->' + edge.target;
      const existing = map.get(key);
      if (existing) existing.count = (existing.count || 1) + 1;
      else map.set(key, { ...edge, count: 1, layer: 'file' });
      return map;
    }, new Map()).values());
    const layerControls = {
      url: document.getElementById('layerUrl'),
      image: document.getElementById('layerImage'),
      missing: document.getElementById('layerMissing'),
    };
    let visualGraphCacheKey = '';
    let visualGraphCache = null;
    const connectedNodeIds = new Set(fileEdges.flatMap((edge) => [edge.source, edge.target]));
    let selectedId = '';
    const graph = document.getElementById('graph');
    const details = document.getElementById('details');
    const search = document.getElementById('search');
    const searchBodyMode = document.getElementById('searchBodyMode');
    const searchFileMode = document.getElementById('searchFileMode');
    const searchStatus = document.getElementById('searchStatus');
    const state = {
      nodes: [],
      edges: [],
      pos: new Map(),
      velocity: new Map(),
      transform: { x: 0, y: 0, scale: 1 },
      pointer: null,
      pointerStart: null,
      clickSuppressed: false,
      highlightedEdge: null,
      highlightedNodeIds: new Set(),
      pulseUntil: 0,
      layers: { url: false, image: false, missing: false },
      groupsEnabled: false,
      activeGroupKey: '',
      activeGroupLabel: '',
      linkFilters: { outbound: 'all', inbound: 'all' },
      linkPages: { outbound: 0, inbound: 0 },
      overviewPage: 0,
      compactLinks: false,
      draggingNode: null,
      running: false,
      frame: 0,
      booting: true,
      searchMode: 'body',
      searchRequestId: 0,
      searchDebounce: 0,
      searchMatchCount: 0,
      bodySearch: { query: '', ids: null, pending: false, error: '' },
    };
    const groupToggle = document.getElementById('toggleGroups');
    groupToggle.setAttribute('aria-pressed', 'false');
    updateMeta();
    updateSearchChrome();
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('fit').addEventListener('click', () => { fitGraph(); paint(); });
    document.getElementById('settle').addEventListener('click', () => settleLayout(160, { defer: true }));
    searchBodyMode.addEventListener('click', () => setSearchMode('body'));
    searchFileMode.addEventListener('click', () => setSearchMode('file'));
    groupToggle.addEventListener('click', (event) => {
      state.groupsEnabled = !state.groupsEnabled;
      event.currentTarget.setAttribute('aria-pressed', String(state.groupsEnabled));
      rebuildGraphState();
      paint();
      updateMeta();
    });
    search.addEventListener('input', handleSearchInput);
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type !== 'searchGraphResults') return;
      applySearchResponse(message);
    });
    for (const [layer, button] of Object.entries(layerControls)) {
      button.addEventListener('click', () => {
        state.layers[layer] = !state.layers[layer];
        button.setAttribute('aria-pressed', String(state.layers[layer]));
        rebuildGraphState();
        settleLayout(100, { defer: true });
        updateMeta();
      });
    }
    function updateMeta() {
      const active = Object.entries(state.layers).filter(([, enabled]) => enabled).map(([layer]) => layer);
      const suffix = active.length ? ' · layers: ' + active.join(', ') : ' · file graph only';
      const group = state.activeGroupKey ? ' · group: ' + state.activeGroupLabel : (state.groupsEnabled ? ' · groups on' : ' · groups off');
      const optional = active.length || state.groupsEnabled ? '' : ' · optional layers off';
      document.getElementById('meta').textContent = db.tables.documents.length + ' files · ' + fileEdges.length + ' file edges · ' + connectedNodeIds.size + ' linked files' + suffix + group + optional + ' · updated ' + new Date(db.updatedAt).toLocaleString();
    }
    function setSearchMode(mode) {
      if (state.searchMode === mode) return;
      state.searchMode = mode;
      updateSearchChrome();
      if (search.value.trim() && mode === 'body') {
        requestBodySearch();
        return;
      }
      rebuildGraphState();
      settleLayout(80, { defer: true });
    }
    function handleSearchInput() {
      if (state.searchMode === 'body') {
        clearTimeout(state.searchDebounce);
        state.bodySearch.pending = Boolean(search.value.trim());
        state.bodySearch.error = '';
        state.searchDebounce = setTimeout(requestBodySearch, 180);
        updateSearchChrome();
        return;
      }
      rebuildGraphState();
      settleLayout(80, { defer: true });
    }
    function requestBodySearch() {
      const query = search.value.trim();
      clearTimeout(state.searchDebounce);
      state.bodySearch.query = query;
      state.bodySearch.ids = null;
      state.bodySearch.pending = Boolean(query);
      state.bodySearch.error = '';
      if (!query) {
        rebuildGraphState();
        updateSearchChrome();
        return;
      }
      const requestId = ++state.searchRequestId;
      vscode.postMessage({ type: 'searchGraph', mode: 'body', query, requestId });
      updateSearchChrome();
    }
    function applySearchResponse(message) {
      if (message.mode !== state.searchMode || Number(message.requestId || 0) !== state.searchRequestId) return;
      state.bodySearch.query = String(message.query || '');
      state.bodySearch.ids = new Set(Array.isArray(message.ids) ? message.ids : []);
      state.bodySearch.pending = false;
      state.bodySearch.error = String(message.error || '');
      rebuildGraphState();
      settleLayout(80, { defer: true });
      updateSearchChrome();
    }
    function updateSearchChrome() {
      const bodyMode = state.searchMode === 'body';
      searchBodyMode.setAttribute('aria-pressed', String(bodyMode));
      searchFileMode.setAttribute('aria-pressed', String(!bodyMode));
      search.placeholder = bodyMode ? 'Search body text...' : 'Search file name or path...';
      search.setAttribute('aria-label', bodyMode ? 'Search Source Graph body text' : 'Search Source Graph file names and paths');
      const query = search.value.trim();
      if (!query) {
        searchStatus.textContent = bodyMode ? 'Body' : 'File';
        return;
      }
      if (bodyMode && state.bodySearch.pending) {
        searchStatus.textContent = 'Searching';
        return;
      }
      if (bodyMode && state.bodySearch.error) {
        searchStatus.textContent = 'Failed';
        return;
      }
      searchStatus.textContent = state.searchMatchCount + ' matches';
    }
    function progressBlock() {
      const active = Object.entries(state.layers).filter(([, enabled]) => enabled).map(([layer]) => layer);
      if (active.length || state.groupsEnabled || state.activeGroupKey) return '';
      return '<div class="block stage"><span class="kicker">Markdown only</span><strong>Optional layers are off</strong><small>The canvas starts with Markdown files and resolved Markdown-to-Markdown edges only. Click URLs, Images, Missing, or Groups to add those layers when needed.</small></div>';
    }
    function supplementalGraph() {
      const nodes = new Map();
      const edges = new Map();
      const addNode = (layer, key, label, path) => {
        const id = layer + ':' + key;
        const current = nodes.get(id);
        if (current) {
          current.weight += 1;
          current.incomingCount += 1;
          return id;
        }
        nodes.set(id, {
          id,
          path,
          label,
          title: path,
          kind: layer,
          layer,
          weight: 2,
          incomingCount: 1,
          outgoingCount: 0,
        });
        return id;
      };
      const addEdge = (link, layer, targetId) => {
        if (!link.sourceDocumentId || !documentNodeIds.has(link.sourceDocumentId)) return;
        const key = link.sourceDocumentId + '->' + targetId;
        const existing = edges.get(key);
        if (existing) {
          existing.count = (existing.count || 1) + 1;
          return;
        }
        edges.set(key, {
          id: layer + ':' + key,
          source: link.sourceDocumentId,
          target: targetId,
          label: link.label || link.href,
          type: link.type,
          status: link.status,
          line: link.line,
          layer,
          count: 1,
        });
      };
      for (const link of db.tables.links || []) {
        const href = String(link.href || link.targetPath || '').trim();
        if (!href || link.targetDocumentId) continue;
        if (state.layers.image && link.type === 'image') {
          addEdge(link, 'image', addNode('image', href, fileNameFromPath(href), href));
          continue;
        }
        if (state.layers.url && (link.status === 'external' || link.type === 'url')) {
          const host = labelForUrl(href);
          addEdge(link, 'url', addNode('url', href, host, href));
          continue;
        }
        if (state.layers.missing && link.status !== 'external' && link.type !== 'image') {
          addEdge(link, 'missing', addNode('missing', href, fileNameFromPath(href), href));
        }
      }
      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    }
    function visualGraph() {
      const key = JSON.stringify(state.layers);
      if (visualGraphCache && visualGraphCacheKey === key) return visualGraphCache;
      const supplemental = supplementalGraph();
      visualGraphCacheKey = key;
      visualGraphCache = {
        nodes: [...documentNodes, ...supplemental.nodes],
        edges: [...fileEdges, ...supplemental.edges],
      };
      return visualGraphCache;
    }
    function currentNodes() {
      return visualGraph().nodes;
    }
    function currentEdges() {
      return visualGraph().edges;
    }
    function labelForUrl(value) {
      try {
        const url = new URL(value);
        return url.hostname.replace(/^www\\./, '');
      } catch {
        return fileNameFromPath(value);
      }
    }
    graph.addEventListener('click', (event) => {
      if (state.clickSuppressed) {
        state.clickSuppressed = false;
        return;
      }
      const node = event.target.closest && event.target.closest('[data-node]');
      const group = event.target.closest && event.target.closest('[data-group-key]');
      if (!node && group) {
        selectGroup(group.getAttribute('data-group-key') || '', group.getAttribute('data-group-label') || '');
        return;
      }
      if (!node) return;
      selectedId = node.getAttribute('data-node') || selectedId;
      highlightNeighborhood(selectedId, true);
      const selectedNode = currentNodes().find((item) => item.id === selectedId);
      paint();
      if (selectedNode?.kind === 'document' && selectedNode.path) {
        vscode.postMessage({ type: 'openPath', path: selectedNode.path });
      }
    });
    details.addEventListener('click', (event) => {
      const filter = event.target.closest && event.target.closest('[data-link-filter]');
      if (filter) {
        const panel = filter.getAttribute('data-link-panel') || '';
        const value = filter.getAttribute('data-link-filter') || 'all';
        if (state.linkFilters[panel] !== undefined) {
          state.linkFilters[panel] = value;
          state.linkPages[panel] = 0;
          paintDetails();
        }
        return;
      }
      const page = event.target.closest && event.target.closest('[data-link-page]');
      if (page) {
        const panel = page.getAttribute('data-link-panel') || '';
        const delta = Number(page.getAttribute('data-link-page') || 0);
        if (state.linkPages[panel] !== undefined && delta) {
          state.linkPages[panel] = Math.max(0, state.linkPages[panel] + delta);
          paintDetails();
        }
        return;
      }
      const compact = event.target.closest && event.target.closest('[data-toggle-link-compact]');
      if (compact) {
        state.compactLinks = !state.compactLinks;
        paintDetails();
        return;
      }
      const overview = event.target.closest && event.target.closest('[data-show-overview]');
      if (overview) {
        showGraphOverview();
        return;
      }
      const overviewPage = event.target.closest && event.target.closest('[data-overview-page]');
      if (overviewPage) {
        const delta = Number(overviewPage.getAttribute('data-overview-page') || 0);
        if (delta) {
          state.overviewPage = Math.max(0, state.overviewPage + delta);
          paintDetails();
        }
        return;
      }
      const openUrl = event.target.closest && event.target.closest('[data-open-url]');
      if (openUrl) {
        const nodeId = openUrl.getAttribute('data-focus-node') || '';
        const edgeKey = openUrl.getAttribute('data-focus-edge') || '';
        focusGraphRelation(nodeId, edgeKey, true);
        vscode.postMessage({ type: 'openUrl', href: openUrl.getAttribute('data-open-url') });
        return;
      }
      const open = event.target.closest && event.target.closest('[data-open-path]');
      if (open) {
        const nodeId = open.getAttribute('data-focus-node') || '';
        const edgeKey = open.getAttribute('data-focus-edge') || '';
        focusGraphRelation(nodeId, edgeKey, true);
        vscode.postMessage({ type: 'openPath', path: open.getAttribute('data-open-path') });
        return;
      }
      const openEditor = event.target.closest && event.target.closest('[data-open-editor-path]');
      if (openEditor) {
        vscode.postMessage({ type: 'openEditorPath', path: openEditor.getAttribute('data-open-editor-path') });
        return;
      }
      const pick = event.target.closest && event.target.closest('[data-pick-node]');
      if (pick) {
        selectedId = pick.getAttribute('data-pick-node');
        highlightNeighborhood(selectedId, true);
        paint();
        return;
      }
      const clearGroup = event.target.closest && event.target.closest('[data-clear-group]');
      if (clearGroup) {
        clearGroupFilter();
        return;
      }
      const pickGroup = event.target.closest && event.target.closest('[data-pick-group]');
      if (pickGroup) selectGroup(pickGroup.getAttribute('data-pick-group') || '', pickGroup.getAttribute('data-pick-group-label') || '');
    });
    function highlightNeighborhood(nodeId, pulse) {
      const ids = new Set([nodeId].filter(Boolean));
      for (const edge of currentEdges()) {
        if (edge.source === nodeId) ids.add(edge.target);
        if (edge.target === nodeId) ids.add(edge.source);
      }
      state.highlightedNodeIds = ids;
      state.highlightedEdge = null;
      state.pulseUntil = pulse ? Date.now() + 1400 : 0;
    }
    function focusGraphRelation(nodeId, edgeKey, center) {
      state.highlightedEdge = edgeKey || null;
      state.highlightedNodeIds = new Set([selectedId, nodeId].filter(Boolean));
      state.pulseUntil = Date.now() + 1400;
      if (nodeId) selectedId = nodeId;
      if (center && nodeId) centerNode(nodeId);
      paint();
    }
    graph.addEventListener('wheel', (event) => {
      event.preventDefault();
      const nextScale = clamp(state.transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.28, 2.8);
      const rect = graph.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const before = screenToWorld(mx, my);
      state.transform.scale = nextScale;
      state.transform.x = mx - before.x * nextScale;
      state.transform.y = my - before.y * nextScale;
      paint();
    }, { passive: false });
    graph.addEventListener('pointerdown', (event) => {
      graph.setPointerCapture(event.pointerId);
      graph.classList.add('dragging');
      state.pointerStart = { x: event.clientX, y: event.clientY };
      state.clickSuppressed = false;
      const nodeEl = event.target.closest && event.target.closest('[data-node]');
      const start = { x: event.clientX, y: event.clientY };
      if (nodeEl) {
        const id = nodeEl.getAttribute('data-node');
        selectedId = id || selectedId;
        state.draggingNode = id;
        const pos = state.pos.get(id);
        if (pos) {
          const world = pointerToWorld(event);
          state.pointer = { mode: 'node', id, dx: pos.x - world.x, dy: pos.y - world.y };
        }
      } else {
        state.pointer = { mode: 'pan', x: start.x, y: start.y, tx: state.transform.x, ty: state.transform.y };
      }
      paint();
    });
    graph.addEventListener('pointermove', (event) => {
      if (!state.pointer) return;
      if (state.pointerStart) {
        const dx = event.clientX - state.pointerStart.x;
        const dy = event.clientY - state.pointerStart.y;
        if (Math.sqrt(dx * dx + dy * dy) > 4) state.clickSuppressed = true;
      }
      if (state.pointer.mode === 'node') {
        const world = pointerToWorld(event);
        state.pos.set(state.pointer.id, { x: world.x + state.pointer.dx, y: world.y + state.pointer.dy, fixed: true });
        state.velocity.set(state.pointer.id, { x: 0, y: 0 });
        tickLayout(3);
        paint();
        return;
      }
      state.transform.x = state.pointer.tx + event.clientX - state.pointer.x;
      state.transform.y = state.pointer.ty + event.clientY - state.pointer.y;
      paint();
    });
    graph.addEventListener('pointerup', endPointer);
    graph.addEventListener('pointercancel', endPointer);
    graph.addEventListener('dblclick', (event) => {
      const nodeEl = event.target.closest && event.target.closest('[data-node]');
      if (!nodeEl) return;
      const pos = state.pos.get(nodeEl.getAttribute('data-node'));
      if (!pos) return;
      centerNode(nodeEl.getAttribute('data-node'));
      paint();
    });
    function centerNode(nodeId) {
      const pos = state.pos.get(nodeId);
      if (!pos) return;
      const rect = graph.getBoundingClientRect();
      state.transform.x = rect.width / 2 - pos.x * state.transform.scale;
      state.transform.y = rect.height / 2 - pos.y * state.transform.scale;
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    }
    function pickInitialNodeId() {
      const nodes = currentNodes();
      const scored = nodes
        .filter((node) => node.kind === 'document')
        .map((node) => ({ node, score: graphDegree(node.id) }))
        .sort((a, b) => b.score - a.score || (a.node.path || '').localeCompare(b.node.path || ''));
      return (scored.find((item) => item.score > 0)?.node || scored[0]?.node || nodes[0] || {}).id || '';
    }
    function graphDegree(id) {
      return currentEdges().reduce((sum, edge) => sum + (edge.source === id || edge.target === id ? 1 : 0), 0);
    }
    function selectGroup(key, label) {
      if (!key) return;
      state.activeGroupKey = key;
      state.activeGroupLabel = label || groupLabel(key);
      selectedId = '';
      rebuildGraphState();
      settleLayout(80, { defer: true });
      updateMeta();
      paint();
    }
    function clearGroupFilter() {
      state.activeGroupKey = '';
      state.activeGroupLabel = '';
      selectedId = '';
      rebuildGraphState();
      settleLayout(80, { defer: true });
      updateMeta();
      paint();
    }
    function showGraphOverview() {
      state.activeGroupKey = '';
      state.activeGroupLabel = '';
      state.highlightedEdge = null;
      state.highlightedNodeIds = new Set();
      state.linkFilters = { outbound: 'all', inbound: 'all' };
      state.linkPages = { outbound: 0, inbound: 0 };
      state.overviewPage = 0;
      selectedId = '';
      rebuildGraphState();
      updateMeta();
      paint();
    }
    function groupKeyForNode(node) {
      if (!node || node.kind !== 'document') return '';
      const normalized = normalizeGraphPath(node.path || '');
      if (!normalized) return '';
      const parts = normalized.split('/').filter(Boolean);
      if (parts.length <= 1) return 'root';
      const dirs = parts.slice(0, -1);
      if (!dirs.length) return 'root';
      const depth = dirs[0] === 'raw' || dirs[0] === 'processed' || dirs[0] === 'wiki' ? 3 : 2;
      return dirs.slice(0, Math.min(depth, dirs.length)).join('/');
    }
    function groupLabel(key) {
      if (key === 'root') return 'Workspace root';
      const parts = String(key || '').split('/').filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
    }
    function normalizeGraphPath(value) {
      return String(value || '').replace(/\\\\/g, '/').replace(/^\\.\\//, '').replace(/\\/+/g, '/').replace(/\\/$/, '');
    }
    function groupColor(key) {
      const palette = ['#7ea0ff', '#5fc4a8', '#c69cff', '#f6d67a', '#ff9f6e', '#7dd3fc', '#ff8fbd'];
      let hash = 0;
      const text = String(key || '');
      for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
      return palette[Math.abs(hash) % palette.length];
    }
    function groupVisibleNodes(nodes) {
      if (!state.activeGroupKey) return nodes;
      const documentIds = new Set(
        currentNodes()
          .filter((node) => groupKeyForNode(node) === state.activeGroupKey)
          .map((node) => node.id)
      );
      const visible = expandWithNeighbors(documentIds);
      return nodes.filter((node) => visible.has(node.id));
    }
    function expandWithNeighbors(ids) {
      const out = new Set(ids);
      for (const edge of currentEdges()) {
        if (ids.has(edge.source)) out.add(edge.target);
        if (ids.has(edge.target)) out.add(edge.source);
      }
      return out;
    }
    function filteredNodes() {
      const q = search.value.trim().toLowerCase();
      if (q) {
        let directMatches = new Set();
        if (state.searchMode === 'body') {
          if (state.bodySearch.query !== search.value.trim() || state.bodySearch.pending && state.bodySearch.ids === null) {
            state.searchMatchCount = 0;
            updateSearchChrome();
            return defaultFilteredNodes();
          }
          directMatches = new Set(state.bodySearch.ids || []);
        } else {
          directMatches = new Set(
            currentNodes()
              .filter((node) => (node.label + ' ' + node.path).toLowerCase().includes(q))
              .map((node) => node.id)
          );
        }
        state.searchMatchCount = directMatches.size;
        updateSearchChrome();
        const expanded = expandWithNeighbors(directMatches);
        return currentNodes()
          .filter((node) => expanded.has(node.id))
          .filter((node) => groupVisibleNodes([node]).length)
          .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || (a.path || '').localeCompare(b.path || ''))
          .slice(0, 160);
      }
      state.searchMatchCount = 0;
      updateSearchChrome();
      return defaultFilteredNodes();
    }
    function defaultFilteredNodes() {
      const activeConnectedIds = new Set(currentEdges().flatMap((edge) => [edge.source, edge.target]));
      const connected = groupVisibleNodes(currentNodes())
        .filter((node) => activeConnectedIds.has(node.id))
        .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || (a.path || '').localeCompare(b.path || ''))
        .slice(0, 160);
      if (connected.length) return connected;
      return groupVisibleNodes(currentNodes())
        .filter((node) => node.kind === 'document')
        .sort((a, b) => (a.path || '').localeCompare(b.path || ''))
        .slice(0, 80);
    }
    function rebuildGraphState() {
      state.nodes = filteredNodes().slice(0, 160);
      const ids = new Set(state.nodes.map((node) => node.id));
      state.edges = currentEdges().filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      const oldPos = state.pos;
      const oldVelocity = state.velocity;
      state.pos = new Map();
      state.velocity = new Map();
      const width = Math.max(720, graph.clientWidth || 720);
      const height = Math.max(420, graph.clientHeight || 420);
        const seeded = seedLayout(state.nodes, state.edges);
      for (const node of state.nodes) {
        state.pos.set(node.id, oldPos.get(node.id) || seeded.get(node.id));
        state.velocity.set(node.id, oldVelocity.get(node.id) || { x: 0, y: 0 });
      }
      if (selectedId && !state.nodes.some((node) => node.id === selectedId)) selectedId = '';
      highlightNeighborhood(selectedId, false);
      fitGraph();
    }
    function seedLayout(nodes, edges) {
      const pos = new Map();
      const cx = 0, cy = 0;
      const linkedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
      const linked = nodes.filter((node) => linkedIds.has(node.id));
      const isolated = nodes.filter((node) => !linkedIds.has(node.id));
      const components = graphComponents(linked, edges);
      const componentCenters = packComponentCenters(components.length);
      components.forEach((component, componentIndex) => {
        const center = componentCenters[componentIndex] || { x: 0, y: 0 };
        const radius = component.length <= 1 ? 0 : Math.max(90, Math.sqrt(component.length) * 44);
        component
          .slice()
          .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || fileLabel(a).localeCompare(fileLabel(b)))
          .forEach((node, index) => {
            const angle = goldenAngle(index);
            const r = radius * Math.sqrt((index + 1) / Math.max(1, component.length));
            pos.set(node.id, { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
          });
      });
      isolated.forEach((node, index) => {
        const angle = goldenAngle(index);
        const r = 260 + 24 * Math.sqrt(index);
        pos.set(node.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
      });
      return pos;
    }
    function graphComponents(nodes, edges) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
      for (const edge of edges) {
        if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
        neighbors.get(edge.source).add(edge.target);
        neighbors.get(edge.target).add(edge.source);
      }
      const seen = new Set();
      const components = [];
      for (const node of nodes) {
        if (seen.has(node.id)) continue;
        const queue = [node.id];
        const ids = [];
        seen.add(node.id);
        while (queue.length) {
          const id = queue.shift();
          ids.push(id);
          for (const next of neighbors.get(id) || []) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
        components.push(ids.map((id) => byId.get(id)).filter(Boolean));
      }
      return components.sort((a, b) => b.length - a.length);
    }
    function packComponentCenters(count) {
      if (count <= 1) return [{ x: 0, y: 0 }];
      const centers = [];
      for (let index = 0; index < count; index += 1) {
        const angle = goldenAngle(index);
        const ring = Math.sqrt(index) * 310;
        centers.push({ x: Math.cos(angle) * ring, y: Math.sin(angle) * ring });
      }
      return centers;
    }
    function goldenAngle(index) {
      return index * 2.399963229728653;
    }
    function settleLayout(iterations, options = {}) {
      if (state.running) cancelAnimationFrame(state.frame);
      state.running = true;
      let remaining = iterations;
      const step = () => {
        tickLayout(4);
        paint();
        remaining -= 4;
        if (remaining > 0) state.frame = requestAnimationFrame(step);
        else state.running = false;
      };
      if (options.defer) state.frame = requestAnimationFrame(step);
      else step();
    }
    function tickLayout(iterations) {
      const nodes = state.nodes;
      const edges = state.edges;
      if (!nodes.length) return;
      for (let step = 0; step < iterations; step += 1) {
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = state.pos.get(nodes[i].id);
            const b = state.pos.get(nodes[j].id);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist2 = Math.max(1600, dx * dx + dy * dy);
            const force = 5200 / dist2;
            const dist = Math.sqrt(dist2);
            applyVelocity(nodes[i].id, -dx / dist * force, -dy / dist * force);
            applyVelocity(nodes[j].id, dx / dist * force, dy / dist * force);
          }
        }
        for (const edge of edges) {
          const a = state.pos.get(edge.source);
          const b = state.pos.get(edge.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const target = 118;
          const force = (dist - target) * 0.008;
          applyVelocity(edge.source, dx / dist * force, dy / dist * force);
          applyVelocity(edge.target, -dx / dist * force, -dy / dist * force);
        }
        for (const node of nodes) {
          const p = state.pos.get(node.id);
          const v = state.velocity.get(node.id);
          if (!p || !v || p.fixed) continue;
          v.x += -p.x * 0.00015;
          v.y += -p.y * 0.00015;
          v.x *= 0.72;
          v.y *= 0.72;
          p.x = p.x + v.x;
          p.y = p.y + v.y;
        }
      }
    }
    function applyVelocity(id, dx, dy) {
      const p = state.pos.get(id);
      if (p?.fixed && state.draggingNode !== id) return;
      const v = state.velocity.get(id);
      if (!v) return;
      v.x += dx;
      v.y += dy;
    }
    function fitGraph() {
      if (!state.nodes.length) return;
      const values = [...state.pos.values()];
      const minX = Math.min(...values.map((p) => p.x));
      const maxX = Math.max(...values.map((p) => p.x));
      const minY = Math.min(...values.map((p) => p.y));
      const maxY = Math.max(...values.map((p) => p.y));
      const width = Math.max(720, graph.clientWidth || 720);
      const height = Math.max(420, graph.clientHeight || 420);
      const graphWidth = Math.max(1, maxX - minX + 140);
      const graphHeight = Math.max(1, maxY - minY + 110);
      const scale = clamp(Math.min(width / graphWidth, height / graphHeight), 0.35, 1.8);
      state.transform.scale = scale;
      state.transform.x = width / 2 - ((minX + maxX) / 2) * scale;
      state.transform.y = height / 2 - ((minY + maxY) / 2) * scale;
    }
    function visibleGroupHulls() {
      if (!state.groupsEnabled && !state.activeGroupKey) return [];
      const groups = new Map();
      for (const node of state.nodes) {
        const key = groupKeyForNode(node);
        if (!key) continue;
        if (state.activeGroupKey && key !== state.activeGroupKey) continue;
        const point = state.pos.get(node.id);
        if (!point) continue;
        const group = groups.get(key) || { key, label: groupLabel(key), color: groupColor(key), points: [] };
        group.points.push(point);
        groups.set(key, group);
      }
      return [...groups.values()]
        .filter((group) => state.activeGroupKey ? group.points.length >= 1 : group.points.length >= 3)
        .sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label))
        .slice(0, state.activeGroupKey ? 1 : 9)
        .map((group) => {
          const xs = group.points.map((point) => point.x);
          const ys = group.points.map((point) => point.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const pad = Math.min(58, Math.max(28, 18 + group.points.length * 0.55));
          return {
            ...group,
            x: minX - pad,
            y: minY - pad,
            width: Math.max(68, maxX - minX + pad * 2),
            height: Math.max(52, maxY - minY + pad * 2),
          };
        });
    }
    function groupHullPath(group) {
      const x = group.x, y = group.y, w = group.width, h = group.height;
      const r = Math.min(38, Math.max(18, Math.min(w, h) * 0.18));
      const wobble = Math.min(14, Math.max(5, group.points.length * 0.8));
      return [
        'M', round(x + r), round(y + wobble),
        'C', round(x + w * 0.28), round(y - wobble), round(x + w * 0.68), round(y + wobble * 0.35), round(x + w - r), round(y + wobble),
        'Q', round(x + w + wobble), round(y + h * 0.5), round(x + w - r), round(y + h - wobble),
        'C', round(x + w * 0.68), round(y + h + wobble), round(x + w * 0.3), round(y + h - wobble * 0.2), round(x + r), round(y + h - wobble),
        'Q', round(x - wobble), round(y + h * 0.5), round(x + r), round(y + wobble),
        'Z',
      ].join(' ');
    }
    function round(value) {
      return Math.round(Number(value) * 10) / 10;
    }
    function fileLabel(node) {
      if (node.kind === 'url') return String(node.label || node.path || 'url');
      const raw = String(node.path || node.label || '');
      const file = raw.split('/').pop() || raw || 'document.md';
      return file.replace(/\\.(md|mdx|markdown|mdown|mkd|mkdn)$/i, '');
    }
    function compact(value) {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      return text.length > 18 ? text.slice(0, 15) + '...' : text;
    }
    function screenToWorld(x, y) {
      return {
        x: (x - state.transform.x) / state.transform.scale,
        y: (y - state.transform.y) / state.transform.scale,
      };
    }
    function pointerToWorld(event) {
      const rect = graph.getBoundingClientRect();
      return screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    }
    function endPointer(event) {
      try { graph.releasePointerCapture(event.pointerId); } catch {}
      graph.classList.remove('dragging');
      state.pointer = null;
      state.pointerStart = null;
      state.draggingNode = null;
    }
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
    function paint() {
      const width = Math.max(720, graph.clientWidth || 720);
      const height = Math.max(420, graph.clientHeight || 420);
      const nodes = state.nodes;
      const ids = new Set(nodes.map((node) => node.id));
      const edges = state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      const hulls = visibleGroupHulls();
      const pos = state.pos;
      const isPulsing = Date.now() < state.pulseUntil;
      graph.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      const t = 'translate(' + state.transform.x.toFixed(2) + ' ' + state.transform.y.toFixed(2) + ') scale(' + state.transform.scale.toFixed(4) + ')';
      graph.innerHTML = '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="rgba(154,171,195,.72)"></path></marker></defs><g transform="' + t + '">' +
        hulls.map((group) => {
          const active = state.activeGroupKey === group.key;
          return '<g class="cluster-hull' + (active ? ' active' : '') + '" data-group-key="' + escapeHtml(group.key) + '" data-group-label="' + escapeHtml(group.label) + '" style="--cluster:' + escapeHtml(group.color) + '"><path class="cluster-fill" d="' + groupHullPath(group) + '"></path><text class="cluster-label" x="' + round(group.x + 18) + '" y="' + round(group.y + 22) + '">' + escapeHtml(compact(group.label)) + ' · ' + group.points.length + '</text></g>';
        }).join('') +
        edges.map((edge) => {
          const a = pos.get(edge.source), b = pos.get(edge.target);
          if (!a || !b) return '';
          const key = edgeKey(edge);
          const adjacent = edge.source === selectedId || edge.target === selectedId;
          const active = state.highlightedEdge === key || adjacent || state.highlightedNodeIds.has(edge.source) && state.highlightedNodeIds.has(edge.target);
          return '<line class="' + escapeHtml(edge.status) + ' layer-' + escapeHtml(edge.layer || 'file') + (active ? ' highlighted' : '') + (adjacent && isPulsing ? ' pulse' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" marker-end="url(#arrow)"></line>';
        }).join('') +
        nodes.map((node) => {
          const p = pos.get(node.id);
          const r = Math.min(30, Math.max(13, 10 + Math.sqrt(node.weight || 1) * 4));
          const active = node.id === selectedId || state.highlightedNodeIds.has(node.id);
          return '<g class="node ' + escapeHtml(node.kind) + (active ? ' selected' : '') + (state.highlightedNodeIds.has(node.id) ? ' related' : '') + (state.highlightedNodeIds.has(node.id) && isPulsing ? ' pulse' : '') + '" data-node="' + escapeHtml(node.id) + '" transform="translate(' + p.x + ' ' + p.y + ')"><circle r="' + r + '"></circle><text y="' + (r + 15) + '" text-anchor="middle">' + escapeHtml(compact(fileLabel(node))) + '</text></g>';
        }).join('') + '</g>';
      paintDetails();
      state.booting = false;
      if (isPulsing) requestAnimationFrame(paint);
    }
    function edgeKey(edge) {
      return edge.source + '->' + edge.target;
    }
    function paintDetails() {
      if (state.activeGroupKey && !selectedId) {
        paintGroupDetails();
        return;
      }
      if (!selectedId) {
        paintOverviewDetails();
        return;
      }
      const selected = currentNodes().find((node) => node.id === selectedId);
      const progress = progressBlock();
      if (!selected) { paintOverviewDetails(); return; }
      const outbound = db.tables.links.filter((link) => link.sourceDocumentId === selected.id);
      const inbound = db.tables.links.filter((link) => link.targetDocumentId === selected.id);
      const document = db.tables.documents.find((doc) => doc.id === selected.id);
      const actions = document
        ? '<div class="button-row"><button data-open-path="' + escapeHtml(document.path) + '" title="Open in Agent Docs viewer" aria-label="Open in Agent Docs viewer">View</button><button data-open-editor-path="' + escapeHtml(document.path) + '" title="Open in editor" aria-label="Open in editor">Edit</button><button class="wide" data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button></div>'
        : '<button data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button>';
      details.innerHTML = progress + '<div class="block"><span class="kicker">' + escapeHtml(selected.layer || 'file') + ' node</span><strong>' + escapeHtml(selected.label || selected.path) + '</strong><small>' + escapeHtml(selected.path || '') + '</small>' + actions + (state.activeGroupKey ? '<button data-clear-group type="button" title="Show full graph" aria-label="Show full graph">&#8617; All</button>' : '') + '<div class="hint">Default canvas shows Markdown file nodes and resolved file-to-file edges. Optional layers add URL, image, and missing-link nodes with separate colors.</div><div class="legend"><span><i class="swatch file"></i>File</span><span><i class="swatch url"></i>URL</span><span><i class="swatch image"></i>Image</span><span><i class="swatch missing"></i>Missing</span></div></div>' +
        linkPanel('Outbound', outbound, 'target', 'outbound') +
        linkPanel('Inbound', inbound, 'source', 'inbound');
    }
    function paintOverviewDetails() {
      const nodes = state.nodes
        .slice()
        .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || fileLabel(a).localeCompare(fileLabel(b)));
      const pageSize = 10;
      const maxPage = Math.max(0, Math.ceil(nodes.length / pageSize) - 1);
      const page = Math.min(state.overviewPage || 0, maxPage);
      state.overviewPage = page;
      const start = page * pageSize;
      const pageItems = nodes.slice(start, start + pageSize);
      const summary = nodes.length
        ? (start + 1) + '-' + Math.min(nodes.length, start + pageSize) + ' of ' + nodes.length
        : '0 nodes';
      details.innerHTML = progressBlock() + '<div class="block"><span class="kicker">overview</span><strong>Full Graph</strong><small>' + state.nodes.length + ' visible nodes · ' + state.edges.length + ' visible edges · ' + db.tables.documents.length + ' indexed files</small><div class="button-row"><button id="fitOverview" type="button" title="Fit visible graph" aria-label="Fit visible graph">Fit</button><button id="settleOverview" type="button" title="Settle graph layout" aria-label="Settle graph layout">Settle</button></div><div class="hint">Select a node to inspect its links. Use ↩ All to return here.</div><div class="legend"><span><i class="swatch file"></i>File</span><span><i class="swatch url"></i>URL</span><span><i class="swatch image"></i>Image</span><span><i class="swatch missing"></i>Missing</span></div></div>' +
        '<div class="block"><span class="kicker">Visible nodes</span><div class="link-toolbar"><div class="link-pager"><button type="button" data-overview-page="-1" title="Previous page" aria-label="Previous page"' + (page <= 0 ? ' disabled' : '') + '>&lsaquo;</button><span>' + escapeHtml(summary) + '</span><button type="button" data-overview-page="1" title="Next page" aria-label="Next page"' + (page >= maxPage ? ' disabled' : '') + '>&rsaquo;</button></div></div>' +
        (pageItems.length ? pageItems.map((node) => '<div class="row" data-pick-node="' + escapeHtml(node.id) + '"><span>' + escapeHtml(fileLabel(node)) + '</span><small>' + escapeHtml((node.layer || 'file') + ' · ' + (node.path || node.label || '')) + '</small></div>').join('') : '<small>No graph data.</small>') + '</div>';
      const fit = document.getElementById('fitOverview');
      if (fit) fit.addEventListener('click', () => { fitGraph(); paint(); });
      const settle = document.getElementById('settleOverview');
      if (settle) settle.addEventListener('click', () => { settleLayout(80, { defer: true }); });
    }
    function paintGroupDetails() {
      const nodes = currentNodes()
        .filter((node) => groupKeyForNode(node) === state.activeGroupKey)
        .sort((a, b) => fileLabel(a).localeCompare(fileLabel(b)));
      const ids = new Set(nodes.map((node) => node.id));
      const edges = currentEdges().filter((edge) => ids.has(edge.source) || ids.has(edge.target));
      const groups = [...new Map(currentNodes()
        .filter((node) => node.kind === 'document')
        .map((node) => [groupKeyForNode(node), groupLabel(groupKeyForNode(node))])
        .filter(([key]) => key)).entries()]
        .sort((a, b) => a[1].localeCompare(b[1]));
      details.innerHTML = progressBlock() + '<div class="block"><span class="kicker">group</span><strong>' + escapeHtml(state.activeGroupLabel || groupLabel(state.activeGroupKey)) + '</strong><small>' + nodes.length + ' files · ' + edges.length + ' visible links</small><div class="button-row"><button data-clear-group type="button" title="Show full graph" aria-label="Show full graph">&#8617; All</button><button id="fitGroup" type="button" title="Fit selected group" aria-label="Fit selected group">Fit</button></div><div class="hint">Groups are inferred from folder paths. Dragging nodes or settling the graph recalculates the group region around the current node positions.</div></div>' +
        '<div class="block"><span class="kicker">Inside group</span>' + (nodes.length ? nodes.slice(0, 24).map((node) => '<div class="row" data-pick-node="' + escapeHtml(node.id) + '"><span>' + escapeHtml(fileLabel(node)) + '</span><small>' + escapeHtml(node.path || '') + '</small></div>').join('') : '<small>No files in this group.</small>') + '</div>' +
        '<div class="block"><span class="kicker">Other groups</span>' + groups.slice(0, 18).map(([key, label]) => '<div class="row" data-pick-group="' + escapeHtml(key) + '" data-pick-group-label="' + escapeHtml(label) + '"><span>' + escapeHtml(label) + '</span><small>' + escapeHtml(key) + '</small></div>').join('') + '</div>';
      const fit = document.getElementById('fitGroup');
      if (fit) fit.addEventListener('click', () => { fitGraph(); paint(); });
    }
    function linkPanel(title, links, openSide, panel) {
      const filter = state.linkFilters[panel] || 'all';
      const counts = linkCounts(links);
      const filtered = filter === 'all' ? links : links.filter((link) => linkCategory(link) === filter);
      const pageSize = state.compactLinks ? 12 : 6;
      const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
      const page = Math.min(state.linkPages[panel] || 0, maxPage);
      state.linkPages[panel] = page;
      const start = page * pageSize;
      const pageItems = filtered.slice(start, start + pageSize);
      const tabs = ['all', 'file', 'url', 'image', 'missing'].map((kind) => {
        const label = kind === 'all' ? 'All' : kind[0].toUpperCase() + kind.slice(1);
        const count = kind === 'all' ? links.length : counts[kind];
        return '<button class="link-tab" type="button" data-link-panel="' + panel + '" data-link-filter="' + kind + '" aria-pressed="' + String(filter === kind) + '">' + label + ' ' + count + '</button>';
      }).join('');
      const summary = filtered.length
        ? (start + 1) + '-' + Math.min(filtered.length, start + pageSize) + ' of ' + filtered.length
        : '0 links';
      return '<div class="block"><span class="kicker">' + escapeHtml(title) + '</span><div class="link-toolbar"><div class="link-tabs">' + tabs + '</div><div class="link-controls"><button class="link-action" type="button" data-toggle-link-compact title="Toggle compact link rows" aria-label="Toggle compact link rows" aria-pressed="' + String(state.compactLinks) + '">' + (state.compactLinks ? 'Full' : 'Slim') + '</button><div class="link-pager"><button type="button" data-link-panel="' + panel + '" data-link-page="-1" title="Previous page" aria-label="Previous page"' + (page <= 0 ? ' disabled' : '') + '>&lsaquo;</button><span>' + escapeHtml(summary) + '</span><button type="button" data-link-panel="' + panel + '" data-link-page="1" title="Next page" aria-label="Next page"' + (page >= maxPage ? ' disabled' : '') + '>&rsaquo;</button></div></div></div>' + linkRows(pageItems, openSide) + '</div>';
    }
    function linkCounts(links) {
      const counts = { file: 0, url: 0, image: 0, missing: 0 };
      for (const link of links) counts[linkCategory(link)] += 1;
      return counts;
    }
    function linkCategory(link) {
      if (link.type === 'image') return 'image';
      if (link.status === 'external' || link.type === 'url') return 'url';
      if (!link.targetDocumentId) return 'missing';
      return 'file';
    }
    function linkTargetNodeId(link, openSide) {
      if (openSide === 'source') return link.sourceDocumentId || '';
      if (link.targetDocumentId) return link.targetDocumentId;
      const category = linkCategory(link);
      const key = String(link.href || link.targetPath || '').trim();
      if (!key || category === 'file') return '';
      return category + ':' + key;
    }
    function linkFocusEdgeKey(link, nodeId, openSide) {
      if (openSide === 'source') return link.sourceDocumentId + '->' + link.targetDocumentId;
      return link.sourceDocumentId + '->' + (nodeId || link.targetDocumentId || '');
    }
    function linkRows(links, openSide) {
      if (!links.length) return '<small>No links in this view.</small>';
      return links.map((link) => {
        const category = linkCategory(link);
        const openPath = openSide === 'source' ? link.sourcePath : (link.targetDocumentId ? link.targetPath : '');
        const nodeId = linkTargetNodeId(link, openSide);
        const key = linkFocusEdgeKey(link, nodeId, openSide);
        const focusAttrs = nodeId ? ' data-focus-node="' + escapeHtml(nodeId) + '" data-focus-edge="' + escapeHtml(key) + '"' : '';
        const href = String(link.href || link.targetPath || '').trim();
        const openAttr = category === 'url' && href
          ? ' data-open-url="' + escapeHtml(href) + '"'
          : (openPath ? ' data-open-path="' + escapeHtml(openPath) + '"' : '');
        const active = state.highlightedEdge === key ? ' is-focused' : '';
        const title = linkTitle(link, openPath);
        const detail = state.compactLinks
          ? 'L' + (link.line || 1) + ' · ' + category
          : 'L' + (link.line || 1) + ' · ' + escapeHtml(link.status) + ' · ' + escapeHtml(link.targetPath || link.href);
        return '<div class="row' + active + (state.compactLinks ? ' compact' : '') + '"' + openAttr + focusAttrs + '><span>' + escapeHtml(title) + '</span><small>' + detail + '</small></div>';
      }).join('');
    }
    function linkTitle(link, openPath) {
      if (link.status === 'external' || link.type === 'url') return labelForUrl(link.href || link.targetPath);
      return fileNameFromPath(openPath || link.targetPath || link.href);
    }
    function fileNameFromPath(value) {
      const raw = String(value || '');
      return (raw.split('/').pop() || raw || 'link').replace(/\\.(md|mdx|markdown|mdown|mkd|mkdn)$/i, '');
    }
    function setLoadingStage(title, detail) {
      if (!state.booting) return;
      details.innerHTML = '<div class="block stage"><span class="kicker">Loading</span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(detail) + '</small><div class="bar"><i></i></div></div>';
    }
    function showBootFailure(error) {
      state.booting = false;
      const message = error && (error.stack || error.message || String(error)) || 'Unknown webview error';
      details.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + escapeHtml(message) + '</small><div class="hint">Close this tab and run Agent Docs: Open Source Graph again. If it repeats, run Agent Docs: Check Source Graph MCP Status.</div></div>';
      graph.innerHTML = '';
    }
    function startProgressiveRender() {
      setLoadingStage('Rendering Markdown files...', 'Showing file nodes and resolved Markdown-to-Markdown edges first.');
      rebuildGraphState();
      if (!selectedId) {
        selectedId = pickInitialNodeId();
        highlightNeighborhood(selectedId, false);
      }
      fitGraph();
      paint();
      requestAnimationFrame(() => {
        setLoadingStage('Settling Markdown graph...', 'The graph is already usable; layout is being refined in small steps.');
        settleLayout(36, { defer: true });
      });
    }
    try {
      startProgressiveRender();
    } catch (error) {
      showBootFailure(error);
    }
    window.addEventListener('resize', paint);
  </script>
</body>
</html>`;
}

function toWebviewSourceGraphDb(db: SourceGraphDb): SourceGraphDb {
  return {
    updatedAt: db.updatedAt,
    root: db.root,
    tables: {
      documents: db.tables.documents || [],
      links: db.tables.links || [],
    },
    graph: {
      nodes: db.graph.nodes || [],
      edges: db.graph.edges || [],
    },
  };
}

function escapeHtmlText(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function escapeTomlString(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
