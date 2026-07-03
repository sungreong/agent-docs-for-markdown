import * as vscode from 'vscode';
import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MPS_IGNORE_FILE, MPS_IGNORE_FILES, isSourceIgnoredUri } from '../utils/sourceIgnore.js';

interface SourceGraphDb {
  updatedAt: string;
  root: string;
  tables: {
    documents: SourceGraphDocument[];
    searchIndex?: SourceGraphSearchIndexEntry[];
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

interface SourceGraphSearchIndexEntry {
  documentId: string;
  path: string;
  title: string;
  text: string;
}

interface SourceGraphSearchRow extends SourceGraphDocument {
  score: number;
}

interface SourceGraphSqliteModule {
  readSourceGraphWebviewSqlite: (dbPath: string) => Promise<SourceGraphDb>;
  searchSourceGraphSqlite: (
    dbPath: string,
    query: string,
    options: { mode: 'body' | 'file'; limit: number },
  ) => Promise<SourceGraphSearchRow[]>;
}

interface SourceGraphWebviewMessage {
  type?: unknown;
  path?: unknown;
  href?: unknown;
  query?: unknown;
  mode?: unknown;
  requestId?: unknown;
  text?: unknown;
  pattern?: unknown;
  patterns?: unknown;
}

interface SourceGraphAuditResult {
  root: string;
  updatedAt: string;
  summary: {
    markdownFiles: number;
    indexedDocuments: number;
    ignoredMarkdownFiles: number;
    unresolvedInternalLinks: number;
    duplicateCopyGroups: number;
    orphanDocuments: number;
  };
  ignore: {
    defaultPatterns: string[];
    userPatterns: string[];
    activePatterns: string[];
    recommendations: SourceGraphIgnoreRecommendation[];
    reviewItems: SourceGraphIgnoreReviewItem[];
  };
  graph: {
    entryDocuments: SourceGraphDocument[];
    orphanDocuments: SourceGraphDocument[];
    unresolvedLinks: Array<{
      sourcePath: string;
      href: string;
      label: string;
      line: number;
      type: string;
      status: string;
    }>;
    duplicateCopyGroups: Array<{
      key: string;
      count: number;
      paths: string[];
    }>;
  };
  notes: string[];
}

interface SourceGraphIgnoreRecommendation {
  pattern: string;
  kind: string;
  confidence: string;
  status: 'candidate' | 'mixed' | 'already-ignored';
  reason: string;
  indexedCount: number;
  ignoredCount: number;
  totalMatches: number;
  examples: string[];
}

interface SourceGraphIgnoreReviewItem {
  path: string;
  kind: string;
  confidence: string;
  suggestedPattern: string;
  reason: string;
}

const DB_RELATIVE_PATH = path.join('.mps', 'source-graph.sqlite');
let sourceGraphPanel: vscode.WebviewPanel | null = null;
let sourceGraphAuditPanel: vscode.WebviewPanel | null = null;
let sourceGraphLauncherWebview: vscode.Webview | null = null;
let sourceGraphWorkspaceFolder: vscode.WorkspaceFolder | null = null;
let sourceGraphAuditWorkspaceFolder: vscode.WorkspaceFolder | null = null;
let sourceGraphLatestAudit: SourceGraphAuditResult | null = null;
let sourceGraphRenderGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let openRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let sourceGraphSqliteModulePromise: Promise<SourceGraphSqliteModule> | null = null;
const sourceGraphDbCache = new Map<string, { mtimeMs: number; size: number; db: SourceGraphDb }>();
const OPEN_REFRESH_DELAY_MS = 1200;
const OPEN_REFRESH_COOLDOWN_MS = 45_000;
export function registerSourceGraphCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'markdownAgentDocsSourceGraphLauncher',
      {
        resolveWebviewView(webviewView) {
          sourceGraphLauncherWebview = webviewView.webview;
          renderSourceGraphLauncherView(webviewView);
          void refreshSourceGraphLauncherStatus(webviewView.webview);
          webviewView.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
            if (!message || typeof message !== 'object') return;
            if (message.type === 'openGraph') void vscode.commands.executeCommand('markdownAgentDocs.openSourceGraph');
            if (message.type === 'initializeGraphGuided') void runGuidedSourceGraphSetup(context, webviewView.webview);
            if (message.type === 'initializeGraph') void vscode.commands.executeCommand('markdownAgentDocs.initializeSourceGraphWorkspace');
            if (message.type === 'updateGraph') void vscode.commands.executeCommand('markdownAgentDocs.updateSourceGraph');
            if (message.type === 'launcherSearch') {
              void respondToLauncherSourceGraphSearch(context, webviewView.webview, message);
            }
            if (message.type === 'runAudit') void respondToLauncherAudit(context, webviewView.webview);
            if (message.type === 'openAuditManager') void openSourceGraphAuditManager(context);
            if (message.type === 'addIgnorePattern' && typeof message.pattern === 'string') {
              void addIgnorePatternFromLauncher(context, webviewView.webview, message.pattern);
            }
            if (message.type === 'addIgnorePatterns' && Array.isArray(message.patterns)) {
              void addIgnorePatternsFromLauncher(context, webviewView.webview, message.patterns);
            }
            if (message.type === 'openPath' && typeof message.path === 'string') {
              void openLauncherGraphPath(message.path, false);
            }
            if (message.type === 'openEditorPath' && typeof message.path === 'string') {
              void openLauncherGraphPath(message.path, true);
            }
            if (message.type === 'editIgnore') void vscode.commands.executeCommand('markdownAgentDocs.openSourceIgnoreFile');
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
      void refreshSourceGraphLauncherStatus(sourceGraphLauncherWebview);
      void vscode.window.showInformationMessage(`Agent Docs source graph initialized: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('markdownAgentDocs.updateSourceGraph', async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) return;
      await updateSourceGraphIndex(context, workspaceFolder);
      void refreshSourceGraphLauncherStatus(sourceGraphLauncherWebview);
      void vscode.window.showInformationMessage(`Agent Docs source graph updated: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('markdownAgentDocs.searchSourceGraph', async () => {
      await searchSourceGraph(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.openSourceGraphAudit', async () => {
      await openSourceGraphAuditManager(context);
    }),
    registerSourceGraphCommand('markdownAgentDocs.openSourceIgnoreFile', async () => {
      await openSourceIgnoreFile();
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{md,mdx,markdown,mdown,mkd,mkdn}');
  const ignoreWatchers = MPS_IGNORE_FILES.map((ignoreFile) => vscode.workspace.createFileSystemWatcher(`**/${ignoreFile}`));
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full')),
    watcher.onDidChange((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'file')),
    watcher.onDidDelete((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full')),
    ...ignoreWatchers.flatMap((ignoreWatcher) => [
      ignoreWatcher,
      ignoreWatcher.onDidCreate((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
      ignoreWatcher.onDidChange((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
      ignoreWatcher.onDidDelete((uri) => scheduleWorkspaceGraphRefresh(context, uri, 'full', true)),
    ]),
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
    .status-card { display: grid; gap: 6px; padding: 9px; border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); border-radius: 5px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .status-card strong { font-size: 12px; }
    .status-card span { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
    button { width: 100%; min-height: 28px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; padding: 5px 7px; text-align: left; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font: inherit; font-size: 12px; line-height: 1.25; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button[disabled] { cursor: default; opacity: .6; }
    .secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .group { display: grid; gap: 6px; }
    .group-title { color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .button-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .toolbar-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .search-panel, .search-panel.is-open { display: grid; gap: 7px; padding: 8px; border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); border-radius: 5px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .audit-panel { display: none; gap: 8px; padding: 8px; border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); border-radius: 5px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.07)); }
    .audit-panel.is-open { display: grid; }
    .audit-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .audit-metric { padding: 7px; border-radius: 4px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.22)); }
    .audit-metric strong { display: block; font-size: 15px; line-height: 1.1; }
    .audit-metric span { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
    .audit-copy { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
    .audit-meta { color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; text-transform: uppercase; letter-spacing: .03em; }
    .audit-section-title { color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .audit-cta { display: grid; gap: 6px; }
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
      <span>Explore Markdown links and sources from the Agent Docs.</span>
    </div>
    <div id="searchPanel" class="search-panel is-open" aria-live="polite">
      <div class="group-title">Search Indexed Docs</div>
      <div class="mode-tabs" role="group" aria-label="Search mode">
        <button id="launcherSearchBody" type="button" aria-pressed="true">Body</button>
        <button id="launcherSearchFile" type="button" aria-pressed="false">File</button>
      </div>
      <div class="search-row">
        <input id="launcherSearchInput" class="search-input" type="search" placeholder="Search Markdown body..." aria-label="Search Markdown body text" />
        <button id="launcherSearchRun" class="icon-button secondary" type="button" title="Run search" aria-label="Run search">↵</button>
      </div>
      <div id="launcherSearchMeta" class="search-meta">Type a query, then press Enter to search indexed Markdown files.</div>
      <div id="launcherSearchResults" class="results"></div>
    </div>
    <div class="status-card" aria-live="polite">
      <strong id="graphStatusTitle">Checking graph status...</strong>
      <span id="graphStatusDetail">Looking for .mps/source-graph.sqlite in this workspace.</span>
    </div>
    <div class="group">
      <div class="group-title">Workspace Controls</div>
      <div class="toolbar-grid">
        <button id="primaryGraphAction" type="button" data-action="initializeGraphGuided">Start Graph</button>
        <button id="auditAction" type="button" class="secondary" data-action="runAudit" disabled>Run Workspace Audit</button>
        <button type="button" class="secondary" data-action="editIgnore">Open .mpsignore</button>
        <button type="button" class="secondary" data-action="openAuditManager">Open Audit Manager</button>
      </div>
    </div>
    <div id="auditPanel" class="audit-panel" aria-live="polite">
      <div id="auditMeta" class="search-meta">Review the search corpus before asking agents to update Markdown documents.</div>
      <div id="auditSummary" class="audit-summary"></div>
      <div class="audit-cta">
        <div class="audit-section-title">Audit Manager</div>
        <div id="auditSelectionCopy" class="audit-copy">Open the dedicated audit manager when you need table rows, pagination, and batch apply.</div>
        <button id="openAuditManager" type="button" class="secondary" data-action="openAuditManager">Open Audit Manager</button>
      </div>
      <div id="auditRecommendations" class="audit-copy"></div>
      <div id="auditReviewItems" class="audit-copy"></div>
    </div>
    <div class="group">
      <div class="group-title">Maintenance</div>
      <div class="button-grid">
        <button type="button" class="secondary" data-action="updateGraph">Update Index</button>
        <button type="button" class="secondary" data-action="initializeGraph">Rebuild Graph</button>
      </div>
    </div>
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
    const graphStatusTitle = document.getElementById('graphStatusTitle');
    const graphStatusDetail = document.getElementById('graphStatusDetail');
    const primaryGraphAction = document.getElementById('primaryGraphAction');
    const auditAction = document.getElementById('auditAction');
    const auditPanel = document.getElementById('auditPanel');
    const auditMeta = document.getElementById('auditMeta');
    const auditSummary = document.getElementById('auditSummary');
    const auditRecommendations = document.getElementById('auditRecommendations');
    const auditReviewItems = document.getElementById('auditReviewItems');
    const auditSelectionCopy = document.getElementById('auditSelectionCopy');
    const restored = vscode.getState && vscode.getState() || {};
    let mode = restored.mode === 'file' ? 'file' : 'body';
    let requestId = Number(restored.requestId || 0);
    let lastResults = Array.isArray(restored.results) ? restored.results : [];
    let lastQuery = String(restored.query || '');
    let lastMeta = String(restored.meta || '');
    let lastAudit = restored.audit || null;
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
        audit: lastAudit,
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
    function promptSearchMeta() {
      return mode === 'body'
        ? 'Press Enter to search indexed Markdown body text.'
        : 'Press Enter to search indexed file names and paths.';
    }
    function setMode(nextMode) {
      mode = nextMode;
      applyModeChrome();
      lastResults = [];
      lastQuery = '';
      searchResults.innerHTML = '';
      searchMeta.textContent = searchInput.value.trim() ? promptSearchMeta() : defaultSearchMeta();
      saveSearchState();
    }
    function openSearchPanel(focus = true) {
      searchPanel.classList.add('is-open');
      saveSearchState();
      if (focus) searchInput.focus();
    }
    function openAuditPanel() {
      auditPanel.classList.add('is-open');
      saveSearchState();
    }
    function metricCard(value, label) {
      return '<div class="audit-metric"><strong>' + escapeHtml(String(value || 0)) + '</strong><span>' + escapeHtml(label) + '</span></div>';
    }
    function renderAudit(message) {
      const audit = message.audit || null;
      lastAudit = audit;
      openAuditPanel();
      if (message.error) {
        auditMeta.textContent = 'Audit failed. Check Source Graph status and try again.';
        auditSummary.innerHTML = '';
        auditRecommendations.innerHTML = '<div class="hint">' + escapeHtml(message.error) + '</div>';
        auditReviewItems.innerHTML = '';
        if (auditSelectionCopy) auditSelectionCopy.textContent = 'The detailed audit manager could not be prepared.';
        saveSearchState();
        return;
      }
      if (!audit) {
        auditMeta.textContent = 'No audit data is available yet.';
        auditSummary.innerHTML = '';
        auditRecommendations.innerHTML = '<div class="hint">Run Workspace Audit to inspect ignore candidates and graph quality.</div>';
        auditReviewItems.innerHTML = '';
        if (auditSelectionCopy) auditSelectionCopy.textContent = 'Open the dedicated audit manager when you need table rows, pagination, and batch apply.';
        saveSearchState();
        return;
      }
      const summary = audit.summary || {};
      auditMeta.textContent = 'Recommended first: review the search corpus before asking an agent to write, analyze, or reorganize Markdown documents.';
      auditSummary.innerHTML = [
        metricCard(summary.markdownFiles, 'Markdown files'),
        metricCard(summary.duplicateCopyGroups, 'Duplicate groups'),
        metricCard(summary.unresolvedInternalLinks, 'Broken Markdown links'),
        metricCard(summary.orphanDocuments, 'Review unlinked docs'),
      ].join('');
      const recommendations = Array.isArray(audit.ignore && audit.ignore.recommendations) ? audit.ignore.recommendations : [];
      const visibleRecommendations = recommendations.filter((item) => item && item.status !== 'already-ignored');
      const hiddenCount = Math.max(0, recommendations.length - visibleRecommendations.length);
      auditRecommendations.innerHTML = visibleRecommendations.length
        ? escapeHtml(visibleRecommendations.length + ' ignore candidates are ready in the Audit Manager.')
        : '<span class="hint">No visible ignore candidates remain.</span>';
      auditReviewItems.innerHTML = hiddenCount > 0
        ? escapeHtml(hiddenCount + ' already-applied recommendations are hidden automatically.')
        : '<span class="hint">Open the Audit Manager for the full table and review queue.</span>';
      if (auditSelectionCopy) auditSelectionCopy.textContent = 'Open the dedicated audit manager for table rows, pagination, compact review, and batch apply.';
      saveSearchState();
    }
    function runSearch() {
      const query = searchInput.value.trim();
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
    function handleSearchInput() {
      const query = searchInput.value.trim();
      if (!query) {
        searchResults.innerHTML = '';
        lastResults = [];
        lastQuery = '';
        searchMeta.textContent = defaultSearchMeta();
        saveSearchState();
        return;
      }
      if (query === lastQuery && lastResults.length) {
        searchMeta.textContent = lastMeta || (lastResults.length + ' result' + (lastResults.length === 1 ? '' : 's') + ' for "' + escapeHtml(lastQuery) + '"');
        saveSearchState();
        return;
      }
      searchResults.innerHTML = '';
      lastResults = [];
      searchMeta.textContent = promptSearchMeta();
      saveSearchState();
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
    function renderLauncherStatus(message) {
      const status = message.status || {};
      if (status.allowPrimary === false) primaryGraphAction.setAttribute('disabled', 'disabled');
      else primaryGraphAction.removeAttribute('disabled');
      if (status.exists) {
        graphStatusTitle.textContent = status.title || 'Graph ready';
        graphStatusDetail.textContent = status.detail || 'Open the graph or search indexed Markdown files.';
        primaryGraphAction.textContent = status.primaryLabel || 'Open Graph';
        primaryGraphAction.setAttribute('data-action', status.primaryAction || 'openGraph');
      } else {
        graphStatusTitle.textContent = status.title || 'Graph not started';
        graphStatusDetail.textContent = status.detail || 'Start Graph to index Markdown links and sources for this workspace.';
        primaryGraphAction.textContent = status.primaryLabel || 'Start Graph';
        primaryGraphAction.setAttribute('data-action', status.primaryAction || 'initializeGraphGuided');
      }
      if (status.allowAudit === false) auditAction.setAttribute('disabled', 'disabled');
      else auditAction.removeAttribute('disabled');
    }
    function restoreSearchState() {
      applyModeChrome();
      searchInput.value = String(restored.query || '');
      if (lastAudit) renderAudit({ audit: lastAudit });
      if (lastResults.length) {
        renderResults({ requestId, query: restored.query || '', results: lastResults });
        return;
      }
      searchMeta.textContent = lastMeta || (searchInput.value.trim() ? promptSearchMeta() : defaultSearchMeta());
    }
    bodyMode.addEventListener('click', () => setMode('body'));
    fileMode.addEventListener('click', () => setMode('file'));
    searchRun.addEventListener('click', runSearch);
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch();
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'launcherSearchResults') renderResults(message);
      if (message.type === 'launcherStatus') renderLauncherStatus(message);
      if (message.type === 'launcherAuditResults') renderAudit(message);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest && event.target.closest('[data-action]');
      if (button) {
        const action = button.getAttribute('data-action');
        if (action === 'runAudit') {
          openAuditPanel();
          auditMeta.textContent = 'Reviewing the workspace...';
          auditSummary.innerHTML = '';
          auditRecommendations.innerHTML = '<div class="hint">Checking ignore candidates, duplicate copies, and graph weak spots.</div>';
          auditReviewItems.innerHTML = '';
          vscode.postMessage({ type: 'runAudit' });
          return;
        }
        if (action === 'initializeGraphGuided') {
          openAuditPanel();
          auditMeta.textContent = 'Creating the graph, opening .mpsignore, and reviewing ignore candidates...';
          auditSummary.innerHTML = '';
          auditRecommendations.innerHTML = '<div class="hint">Building the first index, then opening the ignore file so you can review the managed patterns immediately.</div>';
          auditReviewItems.innerHTML = '';
          vscode.postMessage({ type: 'initializeGraphGuided' });
          return;
        }
        vscode.postMessage({ type: action });
        return;
      }
      const ignoreButton = event.target.closest && event.target.closest('[data-add-ignore-pattern]');
      if (ignoreButton && !ignoreButton.disabled) {
        openAuditPanel();
        auditMeta.textContent = 'Updating .mpsignore and refreshing the audit...';
        vscode.postMessage({ type: 'addIgnorePattern', pattern: ignoreButton.getAttribute('data-add-ignore-pattern') });
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

async function refreshSourceGraphLauncherStatus(webview: vscode.Webview | null): Promise<void> {
  if (!webview) return;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0] ?? null;
  if (!workspaceFolder) {
    await webview.postMessage({
      type: 'launcherStatus',
      status: {
        title: 'Open a workspace folder',
        exists: false,
        detail: 'Open a workspace folder to start a Source Graph.',
        primaryLabel: 'Start Graph',
        primaryAction: 'initializeGraphGuided',
        allowPrimary: false,
        allowAudit: false,
      },
    });
    return;
  }

  try {
    const dbPath = getDbPath(workspaceFolder);
    const stat = await fs.stat(dbPath);
    await webview.postMessage({
      type: 'launcherStatus',
      status: {
        title: 'Graph ready',
        exists: true,
        detail: `Indexed DB found. Last updated ${formatLauncherTimestamp(stat.mtime)}. Recommended next: run Workspace Audit, then batch-apply ignore candidates before asking an agent to update or reorganize Markdown documents.`,
        primaryLabel: 'Open Graph',
        primaryAction: 'openGraph',
        allowPrimary: true,
        allowAudit: true,
      },
    });
  } catch {
    await webview.postMessage({
      type: 'launcherStatus',
      status: {
        title: 'Graph not started',
        exists: false,
        detail: 'No graph DB yet. Start Graph will build the first index, open .mpsignore, and then show ignore candidates so you can clean the corpus immediately.',
        primaryLabel: 'Start Graph',
        primaryAction: 'initializeGraphGuided',
        allowPrimary: true,
        allowAudit: true,
      },
    });
  }
}

function formatLauncherTimestamp(value: Date): string {
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    const results = await searchDb(context, workspaceFolder, query, mode, 80);
    await webview.postMessage({
      type: 'launcherSearchResults',
      mode,
      query,
      requestId,
      results: results.map((item) => ({
        path: item.path,
        title: item.title || path.basename(item.path),
        snippet: item.snippet,
        score: item.score,
        incomingCount: item.incomingCount,
        outgoingCount: item.outgoingCount,
        wordCount: item.wordCount,
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

async function respondToLauncherAudit(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
): Promise<void> {
  try {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      await webview.postMessage({
        type: 'launcherAuditResults',
        error: 'Open a workspace folder before running a workspace audit.',
      });
      return;
    }
    await ensureSourceWorkspaceFiles(workspaceFolder);
    const audit = await runSourceGraphAudit(context, workspaceFolder);
    sourceGraphLatestAudit = audit;
    sourceGraphAuditWorkspaceFolder = workspaceFolder;
    await openSourceGraphAuditPanel(context, workspaceFolder, audit);
    await refreshSourceGraphLauncherStatus(webview);
    await webview.postMessage({ type: 'launcherAuditResults', audit });
  } catch (error) {
    await webview.postMessage({
      type: 'launcherAuditResults',
      error: stringifyError(error),
    });
  }
}

async function runGuidedSourceGraphSetup(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
): Promise<void> {
  try {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      await webview.postMessage({
        type: 'launcherAuditResults',
        error: 'Open a workspace folder before starting the Source Graph setup.',
      });
      return;
    }
    await ensureSourceWorkspaceFiles(workspaceFolder);
    await updateSourceGraphIndex(context, workspaceFolder);
    const ignorePath = await ensureSourceWorkspaceFiles(workspaceFolder);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(ignorePath));
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
    const audit = await runSourceGraphAudit(context, workspaceFolder);
    sourceGraphLatestAudit = audit;
    sourceGraphAuditWorkspaceFolder = workspaceFolder;
    await openSourceGraphAuditPanel(context, workspaceFolder, audit);
    await refreshSourceGraphLauncherStatus(webview);
    await webview.postMessage({ type: 'launcherAuditResults', audit });
    void vscode.window.showInformationMessage('Source Graph is ready. Review .mpsignore and apply the ignore candidates you want.');
  } catch (error) {
    await webview.postMessage({
      type: 'launcherAuditResults',
      error: stringifyError(error),
    });
  }
}

async function runSourceGraphAudit(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<SourceGraphAuditResult> {
  await ensureSourceWorkspaceFiles(workspaceFolder);
  const scriptPath = resolveSourceGraphScriptPath(context);
  await assertSourceGraphPreflight(scriptPath, workspaceFolder);
  const output = await spawnCapture(
    readNodePath(),
    [scriptPath, 'audit', '--root', workspaceFolder.uri.fsPath],
    workspaceFolder.uri.fsPath,
  );
  return JSON.parse(output) as SourceGraphAuditResult;
}

async function openSourceGraphAuditManager(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  await ensureSourceWorkspaceFiles(workspaceFolder);
  const cachedAudit = sourceGraphLatestAudit && sourceGraphAuditWorkspaceFolder && sameWorkspaceFolder(sourceGraphAuditWorkspaceFolder, workspaceFolder)
    ? sourceGraphLatestAudit
    : null;
  if (cachedAudit) {
    await openSourceGraphAuditPanel(context, workspaceFolder, cachedAudit);
    return;
  }
  const panel = ensureSourceGraphAuditPanel(context, workspaceFolder);
  panel.webview.html = renderSourceGraphAuditLoadingHtml('Opening Audit Manager', 'Checking ignore candidates, duplicate copies, and graph weak spots...');
  let audit: SourceGraphAuditResult;
  try {
    audit = await runSourceGraphAudit(context, workspaceFolder);
  } catch (error) {
    panel.webview.html = renderSourceGraphAuditLoadingHtml('Audit failed', stringifyError(error));
    return;
  }
  await openSourceGraphAuditPanel(context, workspaceFolder, audit);
}

function ensureSourceGraphAuditPanel(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): vscode.WebviewPanel {
  sourceGraphAuditWorkspaceFolder = workspaceFolder;
  if (!sourceGraphAuditPanel) {
    sourceGraphAuditPanel = vscode.window.createWebviewPanel(
      'markdownAgentDocsSourceGraphAudit',
      'MPS Audit Manager',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [workspaceFolder.uri],
      },
    );
    sourceGraphAuditPanel.onDidDispose(() => {
      sourceGraphAuditPanel = null;
      sourceGraphAuditWorkspaceFolder = null;
    });
    sourceGraphAuditPanel.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
      if (!message || typeof message !== 'object') return;
      const activeWorkspaceFolder = sourceGraphAuditWorkspaceFolder || workspaceFolder;
      if (message.type === 'refreshAuditPanel') {
        void refreshSourceGraphAuditPanel(context, activeWorkspaceFolder);
      }
      if (message.type === 'applyAuditPatterns' && Array.isArray(message.patterns)) {
        void applyAuditPatternsFromPanel(context, activeWorkspaceFolder, message.patterns);
      }
      if (message.type === 'editIgnore') void vscode.commands.executeCommand('markdownAgentDocs.openSourceIgnoreFile');
      if (message.type === 'openPath' && typeof message.path === 'string') {
        void openGraphPathInViewer(activeWorkspaceFolder, message.path);
      }
      if (message.type === 'openEditorPath' && typeof message.path === 'string') {
        void openGraphPathInEditor(activeWorkspaceFolder, message.path);
      }
    });
  } else {
    sourceGraphAuditPanel.reveal(vscode.ViewColumn.Beside, false);
  }
  sourceGraphAuditPanel.title = `MPS Audit Manager: ${workspaceFolder.name}`;
  return sourceGraphAuditPanel;
}

async function openSourceGraphAuditPanel(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  audit: SourceGraphAuditResult,
): Promise<void> {
  sourceGraphLatestAudit = audit;
  const panel = ensureSourceGraphAuditPanel(context, workspaceFolder);
  panel.webview.html = renderSourceGraphAuditHtml(audit, panel.webview);
}

async function refreshSourceGraphAuditPanel(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<void> {
  if (sourceGraphAuditPanel) {
    sourceGraphAuditPanel.webview.html = renderSourceGraphAuditLoadingHtml('Refreshing Audit', 'Rechecking ignore candidates, duplicate copies, and graph weak spots...');
  }
  const audit = await runSourceGraphAudit(context, workspaceFolder);
  sourceGraphLatestAudit = audit;
  if (sourceGraphAuditPanel) {
    sourceGraphAuditPanel.webview.html = renderSourceGraphAuditHtml(audit, sourceGraphAuditPanel.webview);
  }
  if (sourceGraphLauncherWebview) {
    await refreshSourceGraphLauncherStatus(sourceGraphLauncherWebview);
    await sourceGraphLauncherWebview.postMessage({ type: 'launcherAuditResults', audit });
  }
}

async function applyAuditPatternsFromPanel(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  patterns: readonly unknown[],
): Promise<void> {
  const audit = await applyIgnorePatternsToWorkspace(context, workspaceFolder, patterns);
  sourceGraphLatestAudit = audit;
  if (sourceGraphAuditPanel) {
    sourceGraphAuditPanel.webview.html = renderSourceGraphAuditHtml(audit, sourceGraphAuditPanel.webview);
  }
  if (sourceGraphLauncherWebview) {
    await refreshSourceGraphLauncherStatus(sourceGraphLauncherWebview);
    await sourceGraphLauncherWebview.postMessage({ type: 'launcherAuditResults', audit });
  }
}

async function addIgnorePatternFromLauncher(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  pattern: string,
): Promise<void> {
  await addIgnorePatternsFromLauncher(context, webview, [pattern]);
}

async function addIgnorePatternsFromLauncher(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  patterns: readonly unknown[],
): Promise<void> {
  try {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      await webview.postMessage({
        type: 'launcherAuditResults',
        error: 'Open a workspace folder before editing .mpsignore.',
      });
      return;
    }
    const audit = await applyIgnorePatternsToWorkspace(context, workspaceFolder, patterns);
    sourceGraphLatestAudit = audit;
    sourceGraphAuditWorkspaceFolder = workspaceFolder;
    await openSourceGraphAuditPanel(context, workspaceFolder, audit);
    await refreshSourceGraphLauncherStatus(webview);
    await webview.postMessage({ type: 'launcherAuditResults', audit });
  } catch (error) {
    await webview.postMessage({
      type: 'launcherAuditResults',
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

function registerSourceGraphCommand(command: string, handler: (...args: unknown[]) => Promise<void>): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: unknown[]) => {
    try {
      await handler(...args);
    } catch (error) {
      await showSourceGraphError(command, error);
    }
  });
}

async function openSourceGraphPanel(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  sourceGraphWorkspaceFolder = workspaceFolder;
  const generation = ++sourceGraphRenderGeneration;

  const createdPanel = !sourceGraphPanel;
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
      if (openRefreshTimer) {
        clearTimeout(openRefreshTimer);
        openRefreshTimer = null;
      }
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
  if (createdPanel) {
    sourceGraphPanel.webview.html = renderSourceGraphLoadingHtml(
      sourceGraphPanel.webview,
      'Opening cached graph',
      'Agent Docs is loading the existing Source Graph first. A background refresh may run after the panel becomes responsive.',
    );
  }

  let renderedCachedDb = false;
  let cachedDb: SourceGraphDb | null = null;
  try {
    const db = await readDb(context, workspaceFolder);
    cachedDb = db;
    renderedCachedDb = true;
    sourceGraphPanel.webview.html = renderSourceGraphHtml(db, sourceGraphPanel.webview);
  } catch {
    sourceGraphPanel.webview.html = renderSourceGraphLoadingHtml(
      sourceGraphPanel.webview,
      'Source Graph DB missing',
      'No .mps/source-graph.sqlite exists for this workspace yet. Agent Docs is creating it automatically now; if this fails, run Agent Docs: Initialize Source Graph.',
    );
  }

  scheduleOpenSourceGraphRefresh(context, workspaceFolder, generation, renderedCachedDb, cachedDb);
}

function scheduleOpenSourceGraphRefresh(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  generation: number,
  renderedCachedDb: boolean,
  cachedDb: SourceGraphDb | null,
): void {
  if (cachedDb && isFreshSourceGraphDb(cachedDb)) return;
  if (openRefreshTimer) clearTimeout(openRefreshTimer);
  openRefreshTimer = setTimeout(() => {
    openRefreshTimer = null;
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
            'The graph DB could not be created for this workspace. Run Agent Docs: Initialize Source Graph, then confirm Node.js is available.',
          );
        }
        void showSourceGraphError('openSourceGraph', error);
      });
  }, renderedCachedDb ? OPEN_REFRESH_DELAY_MS : 150);
}

function isFreshSourceGraphDb(db: SourceGraphDb): boolean {
  const updatedAt = Date.parse(db.updatedAt || '');
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < OPEN_REFRESH_COOLDOWN_MS;
}

async function searchSourceGraph(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
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
  const documents = await searchDb(context, workspaceFolder, query, mode.mode, 50);

  const picked = await vscode.window.showQuickPick(
    documents.map((document) => ({
      label: document.title || path.basename(document.path),
      description: document.path,
      detail: `${document.incomingCount} in · ${document.outgoingCount} out · ${document.wordCount} words`,
      document,
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
    const results = await searchDb(context, workspaceFolder, query, mode, 80);
    await webview.postMessage({
      type: 'searchGraphResults',
      mode,
      query,
      requestId,
      ids: results.map((item) => item.id),
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

async function searchDb(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  query: string,
  mode: 'body' | 'file',
  limit: number,
): Promise<SourceGraphSearchRow[]> {
  if (!query.trim()) return [];
  const sqlite = await loadSourceGraphSqliteModule(context);
  try {
    return await sqlite.searchSourceGraphSqlite(getDbPath(workspaceFolder), query, { mode, limit });
  } catch {
    await updateSourceGraphIndex(context, workspaceFolder);
    return sqlite.searchSourceGraphSqlite(getDbPath(workspaceFolder), query, { mode, limit });
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

function searchIndexedDocuments(
  db: SourceGraphDb,
  query: string,
  mode: 'body' | 'file',
  limit: number,
): Array<{ document: SourceGraphDocument; score: number }> {
  const terms = normalizeSourceGraphSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const documents = new Map((db.tables.documents || []).map((document) => [document.id, document]));
  const searchEntries = Array.isArray(db.tables.searchIndex) ? db.tables.searchIndex : [];
  if (!searchEntries.length) {
    return searchFileDocuments(db, query, limit);
  }
  return searchEntries
    .map((entry) => {
      const document = documents.get(entry.documentId);
      if (!document) return null;
      const title = normalizeSourceGraphSearchText(entry.title || '');
      const filePath = normalizeSourceGraphSearchText(entry.path || '');
      const text = mode === 'body' ? normalizeSourceGraphSearchText(entry.text || '') : '';
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += mode === 'body' ? 8 : 10;
        if (filePath.includes(term)) score += mode === 'body' ? 5 : 9;
        if (mode === 'body' && text.includes(term)) score += 1;
      }
      if (mode === 'file' && score > 0) {
        // File mode should not match only body text; it needs a path/title hit.
        const fileOnlyScore = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : 0) + (filePath.includes(term) ? 9 : 0), 0);
        score = fileOnlyScore;
      }
      if (score <= 0) return null;
      return { document, score };
    })
    .filter((item): item is { document: SourceGraphDocument; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || compareSearchPathPriority(a.document.path, b.document.path))
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

function compareSearchPathPriority(aPath: string, bPath: string): number {
  const priorityDelta = searchPathPriority(bPath) - searchPathPriority(aPath);
  if (priorityDelta) return priorityDelta;
  return aPath.localeCompare(bPath);
}

function searchPathPriority(value: string): number {
  const normalizedPath = String(value || '').replace(/\\/g, '/');
  if (normalizedPath === 'README.md') return 80;
  if (/^README(?:\.[^.]+)?\.md$/i.test(normalizedPath)) return 75;
  if (!normalizedPath.includes('/') && !normalizedPath.startsWith('.')) return 70;
  if (!normalizedPath.startsWith('.')) return 50;
  return 30;
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
  const ignorePath = await ensureSourceWorkspaceFiles(workspaceFolder);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(ignorePath));
  await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
}

async function ensureSourceWorkspaceFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  return ensureSourceIgnoreFile(workspaceFolder);
}

async function ensureSourceIgnoreFile(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  const ignorePath = path.join(workspaceFolder.uri.fsPath, MPS_IGNORE_FILE);
  await fs.mkdir(path.dirname(ignorePath), { recursive: true });
  if (!await pathExists(ignorePath)) {
    await fs.writeFile(ignorePath, buildSourceIgnoreTemplate(), 'utf8');
  }
  return ignorePath;
}

function buildSourceIgnoreTemplate(): string {
  return [
    '# Agent Docs ignore rules',
    '# One glob per line. Run `node scripts/source-graph.mjs audit --root .` first when you want recommendations.',
    '# Common document-focused examples:',
    '# .codex/**',
    '# .agents/**',
    '# .claude/**',
    '# .gemini/**',
    '# .cursor/**',
    '# ai_skills/**',
    '# vscode-extension/ai_skills/**',
    '# test/**',
    '# raw/**',
    '# **/drafts/**',
    '# *.draft.md',
    '',
  ].join('\n');
}

function normalizeIgnorePattern(value: string): string {
  return String(value || '').trim().replace(/\\/g, '/');
}

function hasIgnorePattern(source: string, pattern: string): boolean {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === pattern);
}

async function appendIgnorePattern(ignorePath: string, currentSource: string, pattern: string): Promise<void> {
  await appendIgnorePatterns(ignorePath, currentSource, [pattern]);
}

async function applyIgnorePatternsToWorkspace(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  patterns: readonly unknown[],
): Promise<SourceGraphAuditResult> {
  const normalizedPatterns = patterns
    .map((value) => normalizeIgnorePattern(String(value || '')))
    .filter(Boolean);
  if (!normalizedPatterns.length) {
    return runSourceGraphAudit(context, workspaceFolder);
  }
  const ignorePath = await ensureSourceIgnoreFile(workspaceFolder);
  const current = await readTextIfExists(ignorePath);
  const nextPatterns = normalizedPatterns.filter((pattern) => !hasIgnorePattern(current, pattern));
  if (nextPatterns.length) {
    await appendIgnorePatterns(ignorePath, current, nextPatterns);
  }
  return runSourceGraphAudit(context, workspaceFolder);
}

async function appendIgnorePatterns(ignorePath: string, currentSource: string, patterns: readonly string[]): Promise<void> {
  const normalizedSource = currentSource.replace(/\r\n/g, '\n');
  const suffix = normalizedSource.endsWith('\n') || normalizedSource.length === 0 ? '' : '\n';
  const uniquePatterns = Array.from(new Set(patterns.map((pattern) => normalizeIgnorePattern(pattern)).filter(Boolean)));
  if (!uniquePatterns.length) return;
  await fs.writeFile(ignorePath, `${normalizedSource}${suffix}${uniquePatterns.join('\n')}\n`, 'utf8');
}

function sameWorkspaceFolder(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): boolean {
  return normalizeComparePath(a.uri.fsPath) === normalizeComparePath(b.uri.fsPath);
}

function normalizeComparePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function updateSourceGraphIndex(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<SourceGraphDb> {
  await ensureSourceWorkspaceFiles(workspaceFolder);
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
  await ensureSourceWorkspaceFiles(workspaceFolder);
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
  const dbPath = getDbPath(workspaceFolder);
  const cacheKey = normalizeSourceGraphCachePath(dbPath);
  const stat = await fs.stat(dbPath);
  const cached = sourceGraphDbCache.get(cacheKey);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.db;
  const sqlite = await loadSourceGraphSqliteModule(context);
  const db = await sqlite.readSourceGraphWebviewSqlite(dbPath);
  sourceGraphDbCache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, db });
  trimSourceGraphDbCache();
  return db;
}

function getDbPath(workspaceFolder: vscode.WorkspaceFolder): string {
  return path.join(workspaceFolder.uri.fsPath, DB_RELATIVE_PATH);
}

async function loadSourceGraphSqliteModule(context: vscode.ExtensionContext): Promise<SourceGraphSqliteModule> {
  if (!sourceGraphSqliteModulePromise) {
    const sqliteModulePath = path.join(context.extensionPath, 'public', 'core', 'source-graph-sqlite.js');
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<SourceGraphSqliteModule>;
    sourceGraphSqliteModulePromise = dynamicImport(pathToFileURL(sqliteModulePath).href);
  }
  return sourceGraphSqliteModulePromise;
}

function normalizeSourceGraphCachePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function trimSourceGraphDbCache(): void {
  while (sourceGraphDbCache.size > 3) {
    const oldest = sourceGraphDbCache.keys().next().value;
    if (!oldest) return;
    sourceGraphDbCache.delete(oldest);
  }
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
      'Bundled Source Graph CLI script is missing.',
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
    'Update Index',
  );
  if (action === 'Update Index') {
    await vscode.commands.executeCommand('markdownAgentDocs.updateSourceGraph');
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
      '- Run `Agent Docs: Update Source Graph`.',
      '- Confirm Node.js is installed and `markdownAgentDocs.nodePath` is correct.',
      '- Run `Agent Docs: Install or Export Skills`, then choose `Install bundled skills to this workspace` if agent skills are missing.',
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
      cause: 'VS Code does not have permission to write the graph DB or agent skill files.',
      fix: 'Check workspace folder permissions, close apps locking the file, then retry `Agent Docs: Install or Export Skills`.',
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
  return {
    title: 'Source Graph command failed',
    cause: 'The command did not complete successfully.',
    fix: 'Run `Agent Docs: Update Source Graph`, review the technical details, then retry the command.',
    detail,
  };
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

function toAuditManagerViewModel(audit: SourceGraphAuditResult) {
  const recommendations = Array.isArray(audit.ignore?.recommendations) ? audit.ignore.recommendations : [];
  const reviewItems = Array.isArray(audit.ignore?.reviewItems) ? audit.ignore.reviewItems : [];
  const unresolved = Array.isArray(audit.graph?.unresolvedLinks) ? audit.graph.unresolvedLinks : [];
  const duplicateGroups = Array.isArray(audit.graph?.duplicateCopyGroups) ? audit.graph.duplicateCopyGroups : [];
  const orphans = Array.isArray(audit.graph?.orphanDocuments) ? audit.graph.orphanDocuments : [];
  const visibleRecommendations = recommendations
    .filter((item) => item && item.status !== 'already-ignored')
    .map((item) => ({
      pattern: item.pattern,
      kind: item.kind,
      confidence: item.confidence,
      status: item.status,
      reason: item.reason,
      indexedCount: item.indexedCount,
      totalMatches: item.totalMatches,
      examples: Array.isArray(item.examples) ? item.examples.slice(0, 2) : [],
    }));
  const reviewRows = [
    ...reviewItems.map((item) => ({
      path: item.path,
      category: item.kind || 'review',
      reason: item.reason || '',
      suggestedPattern: item.suggestedPattern || '',
    })),
    ...unresolved.map((item) => ({
      path: item.sourcePath,
      category: 'broken-link',
      reason: `Broken link: ${String(item.href || item.label || '')}`,
      suggestedPattern: '',
    })),
  ];
  const weakSpots = [
    ...duplicateGroups.slice(0, 2).map((item) => ({
      title: item.key,
      detail: `${item.count} copies need a canonical decision.`,
    })),
    ...orphans.slice(0, 2).map((item) => ({
      title: item.path,
      detail: 'Unlinked document. Review whether it belongs in the Markdown graph.',
    })),
    ...unresolved.slice(0, 2).map((item) => ({
      title: item.sourcePath,
      detail: `Broken link: ${String(item.href || item.label || '')}`,
    })),
  ];
  return {
    summary: audit.summary,
    recommendations: visibleRecommendations,
    reviewRows,
    weakSpots,
  };
}

function renderSourceGraphAuditLoadingHtml(title: string, detail: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .card { width: min(520px, calc(100vw - 40px)); display: grid; gap: 10px; padding: 18px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.24)); border-radius: 12px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.06)); }
    .kicker { color: var(--vscode-textLink-foreground); font-size: 11px; font-weight: 800; text-transform: uppercase; }
    strong { display: block; font-size: 18px; }
    small { display: block; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .bar { height: 4px; overflow: hidden; border-radius: 999px; background: rgba(128,128,128,.18); }
    .bar i { display: block; width: 38%; height: 100%; border-radius: 999px; background: var(--vscode-progressBar-background, var(--vscode-textLink-foreground)); animation: loadSlide 1.1s ease-in-out infinite alternate; }
    @keyframes loadSlide { from { transform: translateX(-18%); opacity: .65; } to { transform: translateX(180%); opacity: 1; } }
  </style>
</head>
<body>
  <div class="card">
    <span class="kicker">Source Graph Audit Manager</span>
    <strong>${escapeHtmlText(title)}</strong>
    <small>${escapeHtmlText(detail)}</small>
    <div class="bar"><i></i></div>
  </div>
</body>
</html>`;
}

function renderSourceGraphAuditHtml(audit: SourceGraphAuditResult, webview: vscode.Webview): string {
  const nonce = createNonce();
  const json = JSON.stringify(toAuditManagerViewModel(audit)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .page { display: grid; gap: 16px; padding: 18px; }
    .hero { display: grid; gap: 6px; }
    .hero h1 { margin: 0; font-size: 22px; }
    .hero p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .toolbar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    button { min-height: 32px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; padding: 7px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font: inherit; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button[disabled] { opacity: .55; cursor: default; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .metric { padding: 12px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2)); border-radius: 10px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.06)); }
    .metric strong { display: block; font-size: 22px; }
    .metric span { display: block; margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .section { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2)); border-radius: 12px; background: var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .section-head h2 { margin: 0; font-size: 15px; }
    .section-head span { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .tab-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab-row button[aria-pressed="true"] { outline: 1px solid var(--vscode-focusBorder); }
    .table-wrap { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2)); border-radius: 10px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 10px 9px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.15)); vertical-align: top; text-align: left; font-size: 12px; }
    th { color: var(--vscode-descriptionForeground); background: rgba(128,128,128,.06); font-weight: 700; }
    tr:last-child td { border-bottom: none; }
    .compact th, .compact td { padding-top: 7px; padding-bottom: 7px; font-size: 11px; }
    .pattern { font-weight: 700; overflow-wrap: anywhere; }
    .muted { color: var(--vscode-descriptionForeground); }
    .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { display: inline-flex; align-items: center; border-radius: 999px; padding: 1px 7px; font-size: 11px; font-weight: 700; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .tag.subtle { background: transparent; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); color: var(--vscode-descriptionForeground); }
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .pager-actions { display: flex; gap: 8px; }
    .empty { padding: 18px; color: var(--vscode-descriptionForeground); }
    .mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .mini-card { padding: 10px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.18)); border-radius: 10px; background: var(--vscode-editor-background); }
    .mini-card strong { display: block; margin-bottom: 4px; overflow-wrap: anywhere; }
    .mini-card span { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
    @media (max-width: 1100px) { .toolbar, .summary, .mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 720px) { .toolbar, .summary, .mini-grid { grid-template-columns: 1fr; } .pager { flex-direction: column; align-items: stretch; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <h1>Source Graph Audit Manager</h1>
      <p>Use the sidebar for quick status only. This manager is the dense review surface for table rows, pagination, compact scanning, and batch apply.</p>
    </div>
    <div class="toolbar">
      <button type="button" data-action="refreshAuditPanel">Refresh Audit</button>
      <button type="button" class="secondary" data-action="editIgnore">Open .mpsignore</button>
      <button id="toggleCompact" type="button" class="secondary" data-action="toggleCompact" aria-pressed="false">Compact View</button>
      <button id="applySelected" type="button" class="secondary" data-action="applySelected" disabled>Apply Selected</button>
    </div>
    <div class="summary">
      <div class="metric"><strong>${audit.summary.markdownFiles}</strong><span>Markdown files</span></div>
      <div class="metric"><strong>${audit.summary.duplicateCopyGroups}</strong><span>Duplicate groups</span></div>
      <div class="metric"><strong>${audit.summary.unresolvedInternalLinks}</strong><span>Broken Markdown links</span></div>
      <div class="metric"><strong>${audit.summary.orphanDocuments}</strong><span>Review unlinked docs</span></div>
    </div>
    <div class="section">
      <div class="section-head">
        <h2>Review Queue</h2>
        <span id="queueMeta"></span>
      </div>
      <div class="tab-row">
        <button type="button" class="secondary" data-tab="ignore" aria-pressed="true">Ignore Candidates</button>
        <button type="button" class="secondary" data-tab="review" aria-pressed="false">Review Items</button>
      </div>
      <div id="tableMount" class="table-wrap"></div>
      <div class="pager">
        <span id="pageMeta" class="muted"></span>
        <div class="pager-actions">
          <button type="button" class="secondary" data-action="prevPage">Previous</button>
          <button type="button" class="secondary" data-action="nextPage">Next</button>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-head">
        <h2>Graph Weak Spots</h2>
        <span>High-signal follow-up items</span>
      </div>
      <div id="weakSpots" class="mini-grid"></div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const auditView = ${json};
    const tableMount = document.getElementById('tableMount');
    const queueMeta = document.getElementById('queueMeta');
    const pageMeta = document.getElementById('pageMeta');
    const weakSpots = document.getElementById('weakSpots');
    const applySelected = document.getElementById('applySelected');
    const compactToggle = document.getElementById('toggleCompact');
    const pageSize = 20;
    let activeTab = 'ignore';
    let page = 0;
    let compact = false;
    let selectedPatterns = new Set();
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
    }
    function visibleRecommendations() {
      return Array.isArray(auditView.recommendations) ? auditView.recommendations : [];
    }
    function reviewRows() {
      return Array.isArray(auditView.reviewRows) ? auditView.reviewRows : [];
    }
    function currentRows() { return activeTab === 'ignore' ? visibleRecommendations() : reviewRows(); }
    function pagedRows() { const rows = currentRows(); const start = page * pageSize; return rows.slice(start, start + pageSize); }
    function renderWeakSpots() {
      const cards = Array.isArray(auditView.weakSpots) ? auditView.weakSpots : [];
      weakSpots.innerHTML = cards.map((item) => '<div class="mini-card"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.detail) + '</span></div>').join('') || '<div class="empty">No high-signal follow-up items were found.</div>';
    }
    function renderTable() {
      const rows = currentRows();
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      if (page >= totalPages) page = totalPages - 1;
      const visible = pagedRows();
      queueMeta.textContent = activeTab === 'ignore' ? rows.length + ' visible ignore candidates' : rows.length + ' review rows';
      pageMeta.textContent = rows.length ? 'Page ' + (page + 1) + ' of ' + totalPages + ' • ' + rows.length + ' total' : 'Nothing to review';
      applySelected.disabled = !(activeTab === 'ignore' && selectedPatterns.size > 0);
      compactToggle.setAttribute('aria-pressed', String(compact));
      if (!rows.length) {
        tableMount.innerHTML = '<div class="empty">' + (activeTab === 'ignore' ? 'No visible ignore candidates remain. Already applied entries are hidden automatically.' : 'No review rows remain.') + '</div>';
        return;
      }
      if (activeTab === 'ignore') {
        tableMount.innerHTML = '<table class="' + (compact ? 'compact' : '') + '"><thead><tr><th style="width:42px;">Pick</th><th style="width:180px;">Pattern</th><th style="width:110px;">Signal</th><th>Reason</th><th style="width:170px;">Matched</th><th style="width:160px;">Action</th></tr></thead><tbody>' + visible.map((item) => {
          const pattern = String(item.pattern || '');
          const checked = selectedPatterns.has(pattern) ? ' checked' : '';
          return '<tr><td><input type="checkbox" data-pattern="' + escapeHtml(pattern) + '"' + checked + ' /></td><td><div class="pattern">' + escapeHtml(pattern) + '</div><div class="muted">' + escapeHtml(item.kind || '') + '</div></td><td><span class="tag">' + escapeHtml(item.confidence || 'review') + '</span> <span class="tag subtle">' + escapeHtml(item.status || 'candidate') + '</span></td><td>' + escapeHtml(item.reason || '') + '<div class="muted">' + escapeHtml(Array.isArray(item.examples) && item.examples[0] ? 'Example: ' + item.examples[0] : '') + '</div></td><td>' + escapeHtml(String(item.indexedCount || 0)) + ' indexed<br /><span class="muted">' + escapeHtml(String(item.totalMatches || 0)) + ' matched</span></td><td><div class="row-actions"><button type="button" class="secondary" data-apply-one="' + escapeHtml(pattern) + '">Apply now</button></div></td></tr>';
        }).join('') + '</tbody></table>';
        return;
      }
      tableMount.innerHTML = '<table class="' + (compact ? 'compact' : '') + '"><thead><tr><th style="width:280px;">Path</th><th style="width:140px;">Category</th><th>Reason</th><th style="width:160px;">Action</th></tr></thead><tbody>' + visible.map((item) => '<tr><td><div class="pattern">' + escapeHtml(item.path) + '</div><div class="muted">' + escapeHtml(item.suggestedPattern || '') + '</div></td><td><span class="tag subtle">' + escapeHtml(item.category || 'review') + '</span></td><td>' + escapeHtml(item.reason || '') + '</td><td><div class="row-actions"><button type="button" class="secondary" data-open-path="' + escapeHtml(item.path) + '">View</button><button type="button" class="secondary" data-open-editor-path="' + escapeHtml(item.path) + '">Edit</button></div></td></tr>').join('') + '</tbody></table>';
    }
    function setTab(nextTab) {
      activeTab = nextTab;
      page = 0;
      Array.from(document.querySelectorAll('[data-tab]')).forEach((button) => button.setAttribute('aria-pressed', String(button.getAttribute('data-tab') === nextTab)));
      renderTable();
    }
    document.addEventListener('click', (event) => {
      const action = event.target.closest && event.target.closest('[data-action]');
      if (action) {
        const type = action.getAttribute('data-action');
        if (type === 'refreshAuditPanel') vscode.postMessage({ type: 'refreshAuditPanel' });
        if (type === 'editIgnore') vscode.postMessage({ type: 'editIgnore' });
        if (type === 'toggleCompact') { compact = !compact; renderTable(); }
        if (type === 'applySelected') vscode.postMessage({ type: 'applyAuditPatterns', patterns: Array.from(selectedPatterns) });
        if (type === 'prevPage') { page = Math.max(0, page - 1); renderTable(); }
        if (type === 'nextPage') { page += 1; renderTable(); }
        return;
      }
      const tab = event.target.closest && event.target.closest('[data-tab]');
      if (tab) { setTab(tab.getAttribute('data-tab')); return; }
      const applyOne = event.target.closest && event.target.closest('[data-apply-one]');
      if (applyOne) { vscode.postMessage({ type: 'applyAuditPatterns', patterns: [applyOne.getAttribute('data-apply-one')] }); return; }
      const openPath = event.target.closest && event.target.closest('[data-open-path]');
      if (openPath) { vscode.postMessage({ type: 'openPath', path: openPath.getAttribute('data-open-path') }); return; }
      const openEditorPath = event.target.closest && event.target.closest('[data-open-editor-path]');
      if (openEditorPath) { vscode.postMessage({ type: 'openEditorPath', path: openEditorPath.getAttribute('data-open-editor-path') }); return; }
    });
    document.addEventListener('change', (event) => {
      const input = event.target.closest && event.target.closest('[data-pattern]');
      if (!input) return;
      const pattern = input.getAttribute('data-pattern');
      if (!pattern) return;
      if (input.checked) selectedPatterns.add(pattern);
      else selectedPatterns.delete(pattern);
      renderTable();
    });
    renderWeakSpots();
    renderTable();
  </script>
</body>
</html>`;
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
    header { display:grid; grid-template-columns:minmax(220px,1fr) minmax(360px,auto); align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid var(--line); background:rgba(16,24,39,.94); }
    .titlebar { min-width:0; display:grid; gap:3px; }
    strong, small { display:block; }
    small { margin-top:3px; color:var(--muted); }
    #meta { min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .search-tools { display:flex; gap:6px; align-items:center; min-width:min(520px,52vw); }
    .search-mode { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px; padding:2px; border:1px solid var(--line); border-radius:8px; background:#0b111c; }
    .search-mode button { min-width:52px; padding:6px 8px; border-color:transparent; border-radius:6px; color:var(--muted); background:transparent; }
    .search-mode button[aria-pressed="true"] { color:var(--text); border-color:rgba(126,160,255,.55); background:rgba(126,160,255,.16); }
    .search-status { min-width:70px; color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
    .link-direction-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .link-direction-tab { display:grid; gap:2px; padding:7px 8px; text-align:left; }
    .link-direction-tab strong { font-size:11px; line-height:1.15; }
    .link-direction-tab small { margin:0; font-size:10px; line-height:1.2; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .link-direction-tab[aria-pressed="true"] { border-color:var(--accent); background:rgba(126,160,255,.16); }
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
    .node-badge { display:inline-flex; width:max-content; align-items:center; border-radius:999px; padding:2px 7px; font-size:10px; font-weight:800; color:var(--muted); border:1px solid var(--line); background:rgba(255,255,255,.035); }
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
    @media (max-width: 1120px) { header { grid-template-columns:1fr; align-items:start; } .actions { width:100%; justify-content:flex-start; } .search-tools { flex:1 1 420px; min-width:min(100%,420px); } }
    @media (max-width: 860px) { main { grid-template-columns:1fr; grid-template-rows:minmax(320px,1fr) 260px; } aside { border-left:0; border-top:1px solid var(--line); } input { width:100%; } .actions { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); } .actions button { min-width:0; padding:7px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .search-tools { grid-column:1 / -1; width:100%; min-width:0; display:grid; grid-template-columns:auto minmax(0,1fr) auto; } .search-tools input { min-width:0; width:100%; } .search-status { min-width:0; max-width:78px; } }
    @media (max-width: 520px) { header { padding:10px; gap:9px; } .actions { grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; } .search-tools { grid-template-columns:1fr; } .search-mode { grid-template-columns:1fr 1fr; } .search-status { max-width:100%; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="titlebar">
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
      <aside id="details"><div class="block stage"><span class="kicker">Booting cached graph</span><strong>Preparing Markdown files...</strong><small>Opening document-to-document links first. Turn on URLs, Images, Missing, or Groups when you need extra context.</small><div class="bar"><i></i></div></div></aside>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function showEarlyBootFailure(error) {
      const detailsEl = document.getElementById('details');
      const graphEl = document.getElementById('graph');
      const message = error && (error.stack || error.message || String(error)) || 'Unknown webview error';
      if (detailsEl) detailsEl.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + String(message).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])) + '</small><div class="hint">Close this tab and run Agent Docs: Open Source Graph again. If it repeats, run Agent Docs: Update Source Graph.</div></div>';
      if (graphEl) graphEl.innerHTML = '';
    }
    window.addEventListener('error', (event) => showEarlyBootFailure(event.error || event.message));
    window.addEventListener('unhandledrejection', (event) => showEarlyBootFailure(event.reason));
    const db = ${json};
    const documentNodeIds = new Set((db.tables.documents || []).map((doc) => doc.id));
    const docById = new Map((db.tables.documents || []).map((doc) => [doc.id, doc]));
    const documentNodes = (db.graph.nodes || []).filter((node) => documentNodeIds.has(node.id)).map((node) => ({ ...node, kind: 'document', layer: 'file' }));
    const rawFileEdges = (db.graph.edges || []).filter((edge) => documentNodeIds.has(edge.source) && documentNodeIds.has(edge.target));
    const fileEdges = Array.from(rawFileEdges.reduce((map, edge) => {
      const key = edge.source + '->' + edge.target;
      const existing = map.get(key);
      if (existing) existing.count = (existing.count || 1) + 1;
      else map.set(key, { ...edge, count: 1, layer: 'file' });
      return map;
    }, new Map()).values());
    const linksBySource = groupByKey(db.tables.links || [], 'sourceDocumentId');
    const linksByTarget = groupByKey(db.tables.links || [], 'targetDocumentId');
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
      activeLinkPanel: 'outbound',
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
      searchMatchCount: 0,
      bodySearch: { query: '', ids: null, pending: false, error: '' },
    };
    const groupToggle = document.getElementById('toggleGroups');
    groupToggle.setAttribute('aria-pressed', 'false');
    updateMeta();
    updateSearchChrome();
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('fit').addEventListener('click', () => { fitGraph(); paint({ details: false }); });
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
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') requestGraphSearch();
    });
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
        settleLayout(autoSettleIterations(100), { defer: true });
        updateMeta();
      });
    }
    function updateMeta() {
      const active = Object.entries(state.layers).filter(([, enabled]) => enabled).map(([layer]) => layer);
      const layerSummary = active.length ? 'Layers: ' + active.join(', ') : 'Markdown files only';
      const groupSummary = state.activeGroupKey ? 'Group: ' + state.activeGroupLabel : (state.groupsEnabled ? 'Groups on' : 'Groups off');
      document.getElementById('meta').textContent = db.tables.documents.length + ' docs · ' + fileEdges.length + ' doc links · ' + connectedNodeIds.size + ' connected · ' + layerSummary + ' · ' + groupSummary + ' · Updated ' + new Date(db.updatedAt).toLocaleString();
    }
    function setSearchMode(mode) {
      if (state.searchMode === mode) return;
      state.searchMode = mode;
      state.bodySearch.query = '';
      state.bodySearch.ids = null;
      state.bodySearch.pending = false;
      state.bodySearch.error = '';
      updateSearchChrome();
      rebuildGraphState();
      settleLayout(autoSettleIterations(80), { defer: true });
    }
    function handleSearchInput() {
      const query = search.value.trim();
      state.bodySearch.pending = false;
      state.bodySearch.error = '';
      if (!query) {
        state.bodySearch.query = '';
        state.bodySearch.ids = null;
        rebuildGraphState();
        settleLayout(autoSettleIterations(80), { defer: true });
      }
      updateSearchChrome();
    }
    function requestGraphSearch() {
      const query = search.value.trim();
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
      vscode.postMessage({ type: 'searchGraph', mode: state.searchMode, query, requestId });
      updateSearchChrome();
    }
    function applySearchResponse(message) {
      if (message.mode !== state.searchMode || Number(message.requestId || 0) !== state.searchRequestId) return;
      state.bodySearch.query = String(message.query || '');
      state.bodySearch.ids = new Set(Array.isArray(message.ids) ? message.ids : []);
      state.bodySearch.pending = false;
      state.bodySearch.error = String(message.error || '');
      rebuildGraphState();
      settleLayout(autoSettleIterations(80), { defer: true });
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
      if (state.bodySearch.query !== query) {
        searchStatus.textContent = 'Press Enter';
        return;
      }
      if (state.bodySearch.pending) {
        searchStatus.textContent = 'Searching';
        return;
      }
      if (state.bodySearch.error) {
        searchStatus.textContent = 'Failed';
        return;
      }
      searchStatus.textContent = state.searchMatchCount + ' matches';
    }
    function progressBlock() {
      const active = Object.entries(state.layers).filter(([, enabled]) => enabled).map(([layer]) => layer);
      if (active.length || state.groupsEnabled || state.activeGroupKey) return '';
      return '<div class="block stage"><span class="kicker">Markdown files only</span><strong>Extra layers are off</strong><small>The canvas starts with Markdown files and document-to-document links. Turn on URLs, Images, Missing, or Groups when you need those layers.</small></div>';
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
      const nodes = [...documentNodes, ...supplemental.nodes];
      const edges = [...fileEdges, ...supplemental.edges];
      visualGraphCacheKey = key;
      visualGraphCache = { nodes, edges, ...buildGraphIndexes(nodes, edges) };
      return visualGraphCache;
    }
    function currentNodes() {
      return visualGraph().nodes;
    }
    function currentEdges() {
      return visualGraph().edges;
    }
    function currentEdgesByNode() {
      return visualGraph().edgesByNode;
    }
    function edgesForNode(id) {
      return currentEdgesByNode().get(id) || [];
    }
    function currentNodeById() {
      return visualGraph().nodeById;
    }
    function currentConnectedNodeIds() {
      return visualGraph().connectedNodeIds;
    }
    function currentGroupNodeIds() {
      return visualGraph().groupNodeIds;
    }
    function currentGroupEntries() {
      return visualGraph().groupEntries;
    }
    function buildGraphIndexes(nodes, edges) {
      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const degreeByNode = new Map();
      const edgesByNode = new Map();
      const connectedNodeIds = new Set();
      const groupNodeIds = new Map();
      for (const edge of edges) {
        degreeByNode.set(edge.source, (degreeByNode.get(edge.source) || 0) + 1);
        degreeByNode.set(edge.target, (degreeByNode.get(edge.target) || 0) + 1);
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
        const sourceEdges = edgesByNode.get(edge.source) || [];
        sourceEdges.push(edge);
        edgesByNode.set(edge.source, sourceEdges);
        const targetEdges = edgesByNode.get(edge.target) || [];
        targetEdges.push(edge);
        edgesByNode.set(edge.target, targetEdges);
      }
      for (const node of nodes) {
        const key = groupKeyForNode(node);
        if (!key) continue;
        const ids = groupNodeIds.get(key) || new Set();
        ids.add(node.id);
        groupNodeIds.set(key, ids);
      }
      const groupEntries = [...groupNodeIds.keys()]
        .map((key) => [key, groupLabel(key)])
        .sort((a, b) => a[1].localeCompare(b[1]));
      return { nodeById, degreeByNode, edgesByNode, connectedNodeIds, groupNodeIds, groupEntries };
    }
    function groupByKey(items, key) {
      const grouped = new Map();
      for (const item of items) {
        const value = item && item[key];
        if (!value) continue;
        const list = grouped.get(value) || [];
        list.push(item);
        grouped.set(value, list);
      }
      return grouped;
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
      const selectedNode = currentNodeById().get(selectedId);
      paint();
      if (selectedNode?.kind === 'document' && selectedNode.path) {
        vscode.postMessage({ type: 'openPath', path: selectedNode.path });
      }
    });
    details.addEventListener('click', (event) => {
      const direction = event.target.closest && event.target.closest('[data-link-direction]');
      if (direction) {
        const panel = direction.getAttribute('data-link-direction') || 'outbound';
        if (panel === 'outbound' || panel === 'inbound') {
          state.activeLinkPanel = panel;
          state.linkPages[panel] = 0;
          paintDetails();
        }
        return;
      }
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
      for (const edge of edgesForNode(nodeId)) {
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
      const nextScale = clamp(state.transform.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.06, 2.8);
      const rect = graph.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const before = screenToWorld(mx, my);
      state.transform.scale = nextScale;
      state.transform.x = mx - before.x * nextScale;
      state.transform.y = my - before.y * nextScale;
      paint({ details: false });
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
        paint({ details: false });
        return;
      }
      state.transform.x = state.pointer.tx + event.clientX - state.pointer.x;
      state.transform.y = state.pointer.ty + event.clientY - state.pointer.y;
      paint({ details: false });
    });
    graph.addEventListener('pointerup', endPointer);
    graph.addEventListener('pointercancel', endPointer);
    graph.addEventListener('dblclick', (event) => {
      const nodeEl = event.target.closest && event.target.closest('[data-node]');
      if (!nodeEl) return;
      const pos = state.pos.get(nodeEl.getAttribute('data-node'));
      if (!pos) return;
      centerNode(nodeEl.getAttribute('data-node'));
      paint({ details: false });
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
      return visualGraph().degreeByNode.get(id) || 0;
    }
    function graphNodeBudget(kind = 'default') {
      if (kind === 'search') return 120;
      const docs = db.tables.documents.length;
      if (docs > 5000) return 80;
      if (docs > 1000) return 120;
      return 160;
    }
    function autoSettleIterations(preferred) {
      const docs = db.tables.documents.length;
      if (docs > 5000) return Math.min(preferred, 20);
      if (docs > 1000) return Math.min(preferred, 28);
      return preferred;
    }
    function selectGroup(key, label) {
      if (!key) return;
      state.activeGroupKey = key;
      state.activeGroupLabel = label || groupLabel(key);
      selectedId = '';
      rebuildGraphState();
      settleLayout(autoSettleIterations(80), { defer: true });
      updateMeta();
      paint();
    }
    function clearGroupFilter() {
      state.activeGroupKey = '';
      state.activeGroupLabel = '';
      selectedId = '';
      rebuildGraphState();
      settleLayout(autoSettleIterations(80), { defer: true });
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
      const documentIds = currentGroupNodeIds().get(state.activeGroupKey) || new Set();
      const visible = expandWithNeighbors(documentIds);
      return nodes.filter((node) => visible.has(node.id));
    }
    function expandWithNeighbors(ids) {
      const out = new Set(ids);
      for (const id of ids) {
        for (const edge of edgesForNode(id)) {
          if (edge.source === id) out.add(edge.target);
          if (edge.target === id) out.add(edge.source);
        }
      }
      return out;
    }
    function filteredNodes() {
      const q = search.value.trim().toLowerCase();
      if (q) {
        if (state.bodySearch.query !== search.value.trim() || state.bodySearch.pending && state.bodySearch.ids === null) {
          state.searchMatchCount = 0;
          updateSearchChrome();
          return defaultFilteredNodes();
        }
        const directMatches = new Set(state.bodySearch.ids || []);
        state.searchMatchCount = directMatches.size;
        updateSearchChrome();
        const expanded = expandWithNeighbors(directMatches);
        const visibleInGroup = state.activeGroupKey ? expandWithNeighbors(currentGroupNodeIds().get(state.activeGroupKey) || new Set()) : null;
        return currentNodes()
          .filter((node) => expanded.has(node.id) && (!visibleInGroup || visibleInGroup.has(node.id)))
          .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || (a.path || '').localeCompare(b.path || ''))
          .slice(0, graphNodeBudget('search'));
      }
      state.searchMatchCount = 0;
      updateSearchChrome();
      return defaultFilteredNodes();
    }
    function defaultFilteredNodes() {
      const connected = groupVisibleNodes(currentNodes())
        .filter((node) => currentConnectedNodeIds().has(node.id))
        .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || (a.path || '').localeCompare(b.path || ''))
        .slice(0, graphNodeBudget());
      if (connected.length) return connected;
      return groupVisibleNodes(currentNodes())
        .filter((node) => node.kind === 'document')
        .sort((a, b) => (a.path || '').localeCompare(b.path || ''))
        .slice(0, Math.min(80, graphNodeBudget()));
    }
    function rebuildGraphState() {
      const started = performance.now();
      state.nodes = filteredNodes().slice(0, graphNodeBudget(state.bodySearch.query ? 'search' : 'default'));
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
      normalizeLayoutDrift();
      if (selectedId && !state.nodes.some((node) => node.id === selectedId)) selectedId = '';
      highlightNeighborhood(selectedId, false);
      fitGraph();
      reportGraphMetric('rebuildGraphState', started);
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
        const batch = Math.min(4, remaining);
        tickLayout(batch);
        remaining -= batch;
        paint({ details: remaining <= 0 });
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
      const repulsionCutoff2 = nodes.length > 100 ? 360000 : Infinity;
      for (let step = 0; step < iterations; step += 1) {
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = state.pos.get(nodes[i].id);
            const b = state.pos.get(nodes[j].id);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const rawDist2 = dx * dx + dy * dy;
            if (rawDist2 > repulsionCutoff2) continue;
            const dist2 = Math.max(1600, rawDist2);
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
      normalizeLayoutDrift();
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
      normalizeLayoutDrift();
      const values = visibleNodePositions();
      if (!values.length) return;
      const minX = Math.min(...values.map((p) => p.x));
      const maxX = Math.max(...values.map((p) => p.x));
      const minY = Math.min(...values.map((p) => p.y));
      const maxY = Math.max(...values.map((p) => p.y));
      const width = Math.max(720, graph.clientWidth || 720);
      const height = Math.max(420, graph.clientHeight || 420);
      const graphWidth = Math.max(1, maxX - minX + 140);
      const graphHeight = Math.max(1, maxY - minY + 110);
      const scale = clamp(Math.min(width / graphWidth, height / graphHeight), 0.06, 1.8);
      state.transform.scale = scale;
      state.transform.x = width / 2 - ((minX + maxX) / 2) * scale;
      state.transform.y = height / 2 - ((minY + maxY) / 2) * scale;
    }
    function visibleNodePositions() {
      return state.nodes
        .map((node) => state.pos.get(node.id))
        .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    function normalizeLayoutDrift() {
      const points = visibleNodePositions();
      if (!points.length) return;
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const span = Math.max(maxX - minX, maxY - minY, 1);
      const shouldRecentre = Math.abs(centerX) > 1200 || Math.abs(centerY) > 1200;
      const shouldCompress = span > 4200;
      if (!shouldRecentre && !shouldCompress) return;
      const ratio = shouldCompress ? 4200 / span : 1;
      for (const node of state.nodes) {
        const point = state.pos.get(node.id);
        if (!point || point.fixed) continue;
        point.x = (point.x - centerX) * ratio;
        point.y = (point.y - centerY) * ratio;
      }
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
    function isSupplementalNode(node) {
      return Boolean(node && node.kind && node.kind !== 'document');
    }
    function nodeKindLabel(node) {
      if (!node) return 'File node';
      if (node.kind === 'url') return 'URL node';
      if (node.kind === 'image') return 'Image reference node';
      if (node.kind === 'missing') return 'Missing link node';
      return 'File node';
    }
    function supplementalNodeHint(node) {
      if (!isSupplementalNode(node)) return '';
      return '<div class="hint">Virtual link node: this is generated from a Markdown reference, not a real Markdown file. It can be selected for context, but it will not open in the editor unless a source link row is available.</div>';
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
    function reportGraphMetric(label, started) {
      const duration = performance.now() - started;
      if (duration >= 8) console.debug('[MPS Source Graph perf] ' + label + '=' + duration.toFixed(1) + 'ms');
    }
    function paint(options = {}) {
      const started = performance.now();
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
          return '<g class="node ' + escapeHtml(node.kind) + (active ? ' selected' : '') + (state.highlightedNodeIds.has(node.id) ? ' related' : '') + (state.highlightedNodeIds.has(node.id) && isPulsing ? ' pulse' : '') + '" data-node="' + escapeHtml(node.id) + '" data-node-kind="' + escapeHtml(node.kind || 'document') + '" data-virtual-node="' + String(isSupplementalNode(node)) + '" transform="translate(' + p.x + ' ' + p.y + ')"><title>' + escapeHtml(nodeKindLabel(node) + ': ' + (node.path || node.label || node.id)) + '</title><circle r="' + r + '"></circle><text y="' + (r + 15) + '" text-anchor="middle">' + escapeHtml(compact(fileLabel(node))) + '</text></g>';
        }).join('') + '</g>';
      if (options.details !== false) paintDetails();
      reportGraphMetric(options.details === false ? 'paint:graph' : 'paint:with-details', started);
      state.booting = false;
      if (isPulsing) requestAnimationFrame(() => paint({ details: false }));
    }
    function edgeKey(edge) {
      return edge.source + '->' + edge.target;
    }
    function paintDetails() {
      const started = performance.now();
      if (state.activeGroupKey && !selectedId) {
        paintGroupDetails();
        reportGraphMetric('paintDetails', started);
        return;
      }
      if (!selectedId) {
        paintOverviewDetails();
        reportGraphMetric('paintDetails', started);
        return;
      }
      const selected = currentNodeById().get(selectedId);
      const progress = progressBlock();
      if (!selected) {
        paintOverviewDetails();
        reportGraphMetric('paintDetails', started);
        return;
      }
      const selectedLinks = selectedNodeLinks(selected);
      const outbound = selectedLinks.outbound;
      const inbound = selectedLinks.inbound;
      const activeLinkPanel = resolveActiveLinkPanel(outbound, inbound);
      const activeLinks = activeLinkPanel === 'inbound' ? inbound : outbound;
      const activeOpenSide = activeLinkPanel === 'inbound' ? 'source' : 'target';
      const activeTitle = activeLinkPanel === 'inbound' ? 'Inbound' : 'Outbound';
      const document = docById.get(selected.id);
      const actions = document
        ? '<div class="button-row"><button data-open-path="' + escapeHtml(document.path) + '" title="Open in Agent Docs viewer" aria-label="Open in Agent Docs viewer">View</button><button data-open-editor-path="' + escapeHtml(document.path) + '" title="Open in editor" aria-label="Open in editor">Edit</button><button class="wide" data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button></div>'
        : '<button data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button>';
      const virtualBadge = isSupplementalNode(selected) ? '<span class="node-badge">virtual link node</span>' : '';
      details.innerHTML = progress + '<div class="block"><span class="kicker">' + escapeHtml(nodeKindLabel(selected)) + '</span><strong>' + escapeHtml(selected.label || selected.path) + '</strong><small>' + escapeHtml(selected.path || '') + '</small>' + virtualBadge + actions + (state.activeGroupKey ? '<button data-clear-group type="button" title="Show full graph" aria-label="Show full graph">&#8617; All</button>' : '') + supplementalNodeHint(selected) + '<div class="hint">The graph starts with Markdown files and their document links. Turn on URL, Image, or Missing layers when you need external references or unresolved links.</div><div class="legend"><span><i class="swatch file"></i>File</span><span><i class="swatch url"></i>URL</span><span><i class="swatch image"></i>Image</span><span><i class="swatch missing"></i>Missing</span></div></div>' +
        linkDirectionTabs(outbound, inbound, activeLinkPanel) +
        linkPanel(activeTitle, activeLinks, activeOpenSide, activeLinkPanel);
      reportGraphMetric('paintDetails', started);
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
      if (fit) fit.addEventListener('click', () => { fitGraph(); paint({ details: false }); });
      const settle = document.getElementById('settleOverview');
      if (settle) settle.addEventListener('click', () => { settleLayout(80, { defer: true }); });
    }
    function paintGroupDetails() {
      const groupIds = currentGroupNodeIds().get(state.activeGroupKey) || new Set();
      const nodes = currentNodes()
        .filter((node) => groupIds.has(node.id))
        .sort((a, b) => fileLabel(a).localeCompare(fileLabel(b)));
      const ids = new Set(nodes.map((node) => node.id));
      const edges = currentEdges().filter((edge) => ids.has(edge.source) || ids.has(edge.target));
      const groups = currentGroupEntries();
      details.innerHTML = progressBlock() + '<div class="block"><span class="kicker">group</span><strong>' + escapeHtml(state.activeGroupLabel || groupLabel(state.activeGroupKey)) + '</strong><small>' + nodes.length + ' files · ' + edges.length + ' visible links</small><div class="button-row"><button data-clear-group type="button" title="Show full graph" aria-label="Show full graph">&#8617; All</button><button id="fitGroup" type="button" title="Fit selected group" aria-label="Fit selected group">Fit</button></div><div class="hint">Groups are inferred from folder paths. Dragging nodes or settling the graph recalculates the group region around the current node positions.</div></div>' +
        '<div class="block"><span class="kicker">Inside group</span>' + (nodes.length ? nodes.slice(0, 24).map((node) => '<div class="row" data-pick-node="' + escapeHtml(node.id) + '"><span>' + escapeHtml(fileLabel(node)) + '</span><small>' + escapeHtml(node.path || '') + '</small></div>').join('') : '<small>No files in this group.</small>') + '</div>' +
        '<div class="block"><span class="kicker">Other groups</span>' + groups.slice(0, 18).map(([key, label]) => '<div class="row" data-pick-group="' + escapeHtml(key) + '" data-pick-group-label="' + escapeHtml(label) + '"><span>' + escapeHtml(label) + '</span><small>' + escapeHtml(key) + '</small></div>').join('') + '</div>';
      const fit = document.getElementById('fitGroup');
      if (fit) fit.addEventListener('click', () => { fitGraph(); paint({ details: false }); });
    }
    function selectedNodeLinks(node) {
      if (!node) return { outbound: [], inbound: [] };
      if (node.kind === 'document') {
        return {
          outbound: linksBySource.get(node.id) || [],
          inbound: linksByTarget.get(node.id) || [],
        };
      }
      return {
        outbound: [],
        inbound: (db.tables.links || []).filter((link) => linkTargetNodeId(link, 'target') === node.id),
      };
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
      return '<div class="block"><span class="kicker">' + escapeHtml(title) + '</span><div class="link-toolbar"><div class="link-tabs">' + tabs + '</div><div class="link-controls"><button class="link-action" type="button" data-toggle-link-compact title="Toggle compact link rows" aria-label="Toggle compact link rows" aria-pressed="' + String(state.compactLinks) + '">' + (state.compactLinks ? 'Full' : 'Slim') + '</button><div class="link-pager"><button type="button" data-link-panel="' + panel + '" data-link-page="-1" title="Previous page" aria-label="Previous page"' + (page <= 0 ? ' disabled' : '') + '>&lsaquo;</button><span>' + escapeHtml(summary) + '</span><button type="button" data-link-panel="' + panel + '" data-link-page="1" title="Next page" aria-label="Next page"' + (page >= maxPage ? ' disabled' : '') + '>&rsaquo;</button></div></div></div>' + linkRows(pageItems, openSide, selectedId) + '</div>';
    }
    function resolveActiveLinkPanel(outbound, inbound) {
      if (state.activeLinkPanel === 'inbound' && inbound.length) return 'inbound';
      if (state.activeLinkPanel === 'outbound' && outbound.length) return 'outbound';
      if (outbound.length) {
        state.activeLinkPanel = 'outbound';
        return 'outbound';
      }
      if (inbound.length) {
        state.activeLinkPanel = 'inbound';
        return 'inbound';
      }
      return state.activeLinkPanel === 'inbound' ? 'inbound' : 'outbound';
    }
    function linkDirectionTabs(outbound, inbound, activePanel) {
      return '<div class="block"><span class="kicker">Links</span><div class="link-direction-tabs">' +
        linkDirectionTab('outbound', 'Outbound', outbound.length, activePanel) +
        linkDirectionTab('inbound', 'Inbound', inbound.length, activePanel) +
        '</div></div>';
    }
    function linkDirectionTab(panel, label, count, activePanel) {
      const detail = count === 1 ? '1 link' : count + ' links';
      return '<button class="link-direction-tab" type="button" data-link-direction="' + panel + '" aria-pressed="' + String(activePanel === panel) + '" title="Show ' + label + ' links"><strong>' + label + ' ' + count + '</strong><small>' + detail + '</small></button>';
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
    function linkFocusEdgeKey(link, nodeId, openSide, selectedNodeId) {
      if (openSide === 'source') return link.sourceDocumentId + '->' + (selectedNodeId || link.targetDocumentId || '');
      return link.sourceDocumentId + '->' + (nodeId || link.targetDocumentId || '');
    }
    function linkRows(links, openSide, selectedNodeId) {
      if (!links.length) return '<small>No links in this view.</small>';
      return links.map((link) => {
        const category = linkCategory(link);
        const openPath = openSide === 'source' ? link.sourcePath : (link.targetDocumentId ? link.targetPath : '');
        const nodeId = linkTargetNodeId(link, openSide);
        const key = linkFocusEdgeKey(link, nodeId, openSide, selectedNodeId);
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
      details.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + escapeHtml(message) + '</small><div class="hint">Close this tab and run Agent Docs: Open Source Graph again. If it repeats, run Agent Docs: Update Source Graph.</div></div>';
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
        settleLayout(autoSettleIterations(36), { defer: true });
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
