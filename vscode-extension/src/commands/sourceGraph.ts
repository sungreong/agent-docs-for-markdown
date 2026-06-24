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
}

const DB_RELATIVE_PATH = path.join('.mps', 'source-graph.sqlite');
let sourceGraphPanel: vscode.WebviewPanel | null = null;
let sourceGraphWorkspaceFolder: vscode.WorkspaceFolder | null = null;
let sourceGraphRenderGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function registerSourceGraphCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mdStudioSourceGraphLauncher', {
      resolveWebviewView(webviewView) {
        renderSourceGraphLauncherView(webviewView);
        webviewView.webview.onDidReceiveMessage((message: SourceGraphWebviewMessage) => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'openGraph') void vscode.commands.executeCommand('mdStudioPreview.openSourceGraph');
          if (message.type === 'initializeGraph') void vscode.commands.executeCommand('mdStudioPreview.initializeSourceGraphWorkspace');
          if (message.type === 'updateGraph') void vscode.commands.executeCommand('mdStudioPreview.updateSourceGraph');
          if (message.type === 'searchGraph') void vscode.commands.executeCommand('mdStudioPreview.searchSourceGraph');
          if (message.type === 'editIgnore') void vscode.commands.executeCommand('mdStudioPreview.openSourceIgnoreFile');
          if (message.type === 'installMcp') void vscode.commands.executeCommand('mdStudioPreview.installCodexMcp');
          if (message.type === 'checkMcp') void vscode.commands.executeCommand('mdStudioPreview.checkCodexMcpStatus');
        });
      },
    }),
    registerSourceGraphCommand('mdStudioPreview.openSourceGraph', async () => {
      await openSourceGraphPanel(context);
    }),
    registerSourceGraphCommand('mdStudioPreview.initializeSourceGraphWorkspace', async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) return;
      await updateSourceGraphIndex(context, workspaceFolder);
      void vscode.window.showInformationMessage(`MD Studio source graph initialized: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('mdStudioPreview.updateSourceGraph', async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) return;
      await updateSourceGraphIndex(context, workspaceFolder);
      void vscode.window.showInformationMessage(`MD Studio source graph updated: ${getDbPath(workspaceFolder)}`);
    }),
    registerSourceGraphCommand('mdStudioPreview.searchSourceGraph', async () => {
      await searchSourceGraph(context);
    }),
    registerSourceGraphCommand('mdStudioPreview.openSourceIgnoreFile', async () => {
      await openSourceIgnoreFile();
    }),
    registerSourceGraphCommand('mdStudioPreview.copyCodexMcpConfig', async () => {
      await copyCodexMcpConfig(context);
    }),
    registerSourceGraphCommand('mdStudioPreview.installCodexMcp', async () => {
      await installCodexMcp(context);
    }),
    registerSourceGraphCommand('mdStudioPreview.checkCodexMcpStatus', async () => {
      await checkCodexMcpStatus(context);
    }),
    registerSourceGraphCommand('mdStudioPreview.removeCodexMcp', async () => {
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
    body { margin: 0; padding: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    .stack { display: grid; gap: 10px; }
    .head { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.25)); }
    .head strong { font-size: 13px; }
    .head span { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
    button { width: 100%; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 7px 8px; text-align: left; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
    .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .hint { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="stack">
    <div class="head">
      <strong>Source Graph</strong>
      <span>Open the workspace Markdown graph, update the index, or connect Codex MCP.</span>
    </div>
    <button type="button" data-action="openGraph">Open Source Graph</button>
    <button type="button" class="secondary" data-action="initializeGraph">Initialize Workspace DB</button>
    <button type="button" class="secondary" data-action="searchGraph">Search Graph</button>
    <button type="button" class="secondary" data-action="updateGraph">Update Index</button>
    <button type="button" class="secondary" data-action="editIgnore">Edit Ignore</button>
    <button type="button" class="secondary" data-action="installMcp">Install Codex MCP</button>
    <button type="button" class="secondary" data-action="checkMcp">Check MCP Status</button>
    <div class="hint">Tip: the graph icon in the File Browser toolbar opens this graph directly too.</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const button = event.target.closest && event.target.closest('[data-action]');
      if (!button) return;
      vscode.postMessage({ type: button.getAttribute('data-action') });
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
  const snippet = buildMcpTomlBlock('markdown_pattern_studio_source_graph', scriptPath, root, false);
  await vscode.env.clipboard.writeText(snippet);
  void vscode.window.showInformationMessage('Codex MCP config copied. Paste it into your Codex config.toml, then restart Codex.');
}

async function installCodexMcp(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const target = await pickCodexConfigTarget(workspaceFolder);
  if (!target) return;
  const scriptPath = resolveSourceGraphScriptPath(context);
  await assertSourceGraphPreflight(scriptPath, workspaceFolder);
  const root = workspaceFolder.uri.fsPath;
  const serverName = getMcpServerName(workspaceFolder, target.scope);
  const configPath = getCodexConfigPath(workspaceFolder, target.scope);
  await updateSourceGraphIndex(context, workspaceFolder);
  const backupPath = await upsertManagedMcpBlock(configPath, serverName, scriptPath, root);
  const restart = target.scope === 'workspace'
    ? 'Restart Codex or start a new Codex session for this trusted workspace.'
    : 'Restart Codex or start a new Codex session.';
  const backupText = backupPath ? ` Backup: ${backupPath}` : '';
  void vscode.window.showInformationMessage(`MD Studio Source Graph MCP installed in ${configPath}.${backupText} ${restart}`);
}

async function checkCodexMcpStatus(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const scriptPath = resolveSourceGraphScriptPath(context);
  const dbPath = getDbPath(workspaceFolder);
  const workspaceConfigPath = getCodexConfigPath(workspaceFolder, 'workspace');
  const userConfigPath = getCodexConfigPath(workspaceFolder, 'user');
  const workspaceServerName = getMcpServerName(workspaceFolder, 'workspace');
  const userServerName = getMcpServerName(workspaceFolder, 'user');
  const checks = [
    `Workspace: ${workspaceFolder.uri.fsPath}`,
    `Node: ${await checkNodeAvailable()}`,
    `Bundled MCP script: ${await pathExists(scriptPath) ? scriptPath : 'missing'}`,
    `Graph DB: ${await pathExists(dbPath) ? dbPath : 'missing - run MD Studio: Initialize Source Graph Workspace'}`,
    `Workspace config: ${await describeConfigRegistration(workspaceConfigPath, workspaceServerName)}`,
    `User config: ${await describeConfigRegistration(userConfigPath, userServerName)}`,
  ];
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `# MD Studio Source Graph MCP Status\n\n${checks.map((item) => `- ${item}`).join('\n')}\n\nIf the MCP config is newly installed, restart Codex or start a new Codex session. Project-scoped config requires the workspace to be trusted by Codex.\n`,
  });
  await vscode.window.showTextDocument(document, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

async function removeCodexMcp(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const target = await pickCodexConfigTarget(workspaceFolder);
  if (!target) return;
  const configPath = getCodexConfigPath(workspaceFolder, target.scope);
  const serverName = getMcpServerName(workspaceFolder, target.scope);
  const removed = await removeManagedMcpBlock(configPath, serverName);
  const message = removed
    ? `MD Studio Source Graph MCP removed from ${configPath}. Restart Codex or start a new Codex session.`
    : `No MD Studio Source Graph MCP block found in ${configPath}.`;
  void vscode.window.showInformationMessage(message);
}

async function openSourceGraphPanel(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  sourceGraphWorkspaceFolder = workspaceFolder;
  const generation = ++sourceGraphRenderGeneration;

  if (!sourceGraphPanel) {
    sourceGraphPanel = vscode.window.createWebviewPanel(
      'mdStudioSourceGraph',
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
      'No .mps/source-graph.sqlite exists for this workspace yet. MD Studio is creating it automatically now; if this fails, run MD Studio: Initialize Source Graph Workspace or Check Codex Source Graph MCP Status.',
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
          'The graph DB could not be created for this workspace. Run MD Studio: Initialize Source Graph Workspace, or run Check Codex Source Graph MCP Status for setup details.',
        );
      }
      void showSourceGraphError('openSourceGraph', error);
    });
}

async function searchSourceGraph(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const db = await loadOrUpdateDb(context, workspaceFolder);
  const query = await vscode.window.showInputBox({
    title: 'Search Source Graph',
    prompt: 'Search indexed Markdown by title, path, or content.',
    placeHolder: 'report, DESIGN.md, source, ...',
  });
  if (!query) return;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const documents = db.tables.documents
    .map((document) => {
      const haystack = `${document.title} ${document.path} ${document.snippet}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { document, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
    .slice(0, 50);

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

async function openSourceIgnoreFile(): Promise<void> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) return;
  const ignorePath = path.join(workspaceFolder.uri.fsPath, MPS_IGNORE_FILE);
  if (!await pathExists(ignorePath)) {
    await fs.writeFile(ignorePath, [
      '# Markdown Pattern Studio ignore rules',
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
  const raw = vscode.workspace.getConfiguration('mdStudioPreview').get<string>('nodePath', 'node');
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
      'Install Node.js, or set VS Code setting mdStudioPreview.nodePath to the absolute path of node.exe, then retry the command.',
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
    await vscode.commands.executeCommand('mdStudioPreview.checkCodexMcpStatus');
    return;
  }
  if (action !== 'Show Details') return;
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      '# MD Studio Source Graph Error',
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
      '- Run `MD Studio: Check Codex Source Graph MCP Status`.',
      '- Confirm Node.js is installed and `mdStudioPreview.nodePath` is correct.',
      '- Confirm the workspace is trusted in Codex if you installed workspace `.codex/config.toml`.',
      '- Re-run `MD Studio: Install Codex Source Graph MCP` after fixing the issue.',
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
      fix: 'Install Node.js, or set mdStudioPreview.nodePath to the absolute path of node.exe, then retry.',
      detail,
    };
  }
  if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission')) {
    return {
      title: 'Source Graph setup failed',
      cause: 'VS Code does not have permission to write the graph DB or Codex config file.',
      fix: 'Check folder permissions, close apps locking the file, or choose user-level config if workspace config cannot be written.',
      detail,
    };
  }
  if (lower.includes('json') || lower.includes('unexpected token')) {
    return {
      title: 'Source Graph setup failed',
      cause: 'The existing source graph database appears to be corrupt or partially written.',
      fix: 'Delete `.mps/source-graph.sqlite` and run `MD Studio: Update Source Graph Index` again.',
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
    fix: 'Run `MD Studio: Check Codex Source Graph MCP Status`, review the technical details, then retry the command.',
    detail,
  };
}

type CodexConfigScope = 'workspace' | 'user';

interface CodexConfigTarget {
  scope: CodexConfigScope;
  label: string;
}

async function pickCodexConfigTarget(workspaceFolder: vscode.WorkspaceFolder): Promise<CodexConfigTarget | null> {
  const picked = await vscode.window.showQuickPick<CodexConfigTarget>(
    [
      {
        scope: 'workspace',
        label: 'Workspace .codex/config.toml (Recommended)',
      },
      {
        scope: 'user',
        label: 'User ~/.codex/config.toml',
      },
    ],
    {
      placeHolder: `Install MCP config for ${workspaceFolder.name}`,
      title: 'Choose where Codex should load the Source Graph MCP server.',
    },
  );
  return picked || null;
}

function getCodexConfigPath(workspaceFolder: vscode.WorkspaceFolder, scope: CodexConfigScope): string {
  if (scope === 'workspace') return path.join(workspaceFolder.uri.fsPath, '.codex', 'config.toml');
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function getMcpServerName(workspaceFolder: vscode.WorkspaceFolder, scope: CodexConfigScope): string {
  if (scope === 'workspace') return 'markdown_pattern_studio_source_graph';
  return `markdown_pattern_studio_source_graph_${hashText(workspaceFolder.uri.fsPath)}`;
}

function buildMcpTomlBlock(serverName: string, scriptPath: string, root: string, managed: boolean): string {
  const lines = [
    `[mcp_servers.${serverName}]`,
    `command = "${escapeTomlString(readNodePath())}"`,
    `args = ["${escapeTomlString(scriptPath)}", "mcp", "--root", "${escapeTomlString(root)}"]`,
    `cwd = "${escapeTomlString(root)}"`,
    'startup_timeout_sec = 20',
    'tool_timeout_sec = 60',
    'enabled = true',
  ];
  if (!managed) return `${lines.join('\n')}\n`;
  return [
    `# BEGIN MD Studio Source Graph MCP: ${serverName}`,
    ...lines,
    `# END MD Studio Source Graph MCP: ${serverName}`,
    '',
  ].join('\n');
}

async function upsertManagedMcpBlock(configPath: string, serverName: string, scriptPath: string, root: string): Promise<string> {
  const existing = await readTextIfExists(configPath);
  const nextBlock = buildMcpTomlBlock(serverName, scriptPath, root, true);
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

async function removeManagedMcpBlock(configPath: string, serverName: string): Promise<boolean> {
  const existing = await readTextIfExists(configPath);
  if (!existing) return false;
  const pattern = managedBlockPattern(serverName);
  if (!pattern.test(existing)) return false;
  const next = existing.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  await fs.writeFile(configPath, next ? `${next}\n` : '', 'utf8');
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
  return new RegExp(`# BEGIN MD Studio Source Graph MCP: ${escaped}\\n[\\s\\S]*?# END MD Studio Source Graph MCP: ${escaped}\\n?`, 'm');
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

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
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
  await vscode.commands.executeCommand('mdStudioPreview.openFileInViewer', uri);
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
    @media (max-width: 860px) { main { grid-template-columns:1fr; grid-template-rows:minmax(320px,1fr) 260px; } aside { border-left:0; border-top:1px solid var(--line); } input { width:100%; } header { align-items:flex-start; flex-direction:column; } .actions { width:100%; justify-content:flex-start; } }
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
        <input id="search" type="search" placeholder="Search graph..." />
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
      if (detailsEl) detailsEl.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + String(message).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])) + '</small><div class="hint">Close this tab and run MD Studio: Open Source Graph again. If it repeats, run MD Studio: Check Codex Source Graph MCP Status.</div></div>';
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
    };
    const groupToggle = document.getElementById('toggleGroups');
    groupToggle.setAttribute('aria-pressed', 'false');
    updateMeta();
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('fit').addEventListener('click', () => { fitGraph(); paint(); });
    document.getElementById('settle').addEventListener('click', () => settleLayout(160, { defer: true }));
    groupToggle.addEventListener('click', (event) => {
      state.groupsEnabled = !state.groupsEnabled;
      event.currentTarget.setAttribute('aria-pressed', String(state.groupsEnabled));
      rebuildGraphState();
      paint();
      updateMeta();
    });
    search.addEventListener('input', () => { rebuildGraphState(); settleLayout(80, { defer: true }); });
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
        const directMatches = new Set(
          currentNodes()
            .filter((node) => (node.label + ' ' + node.path).toLowerCase().includes(q))
            .map((node) => node.id)
        );
        const expanded = expandWithNeighbors(directMatches);
        return currentNodes()
          .filter((node) => expanded.has(node.id))
          .filter((node) => groupVisibleNodes([node]).length)
          .sort((a, b) => graphDegree(b.id) - graphDegree(a.id) || (a.path || '').localeCompare(b.path || ''))
          .slice(0, 160);
      }
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
        ? '<div class="button-row"><button data-open-path="' + escapeHtml(document.path) + '" title="Open in MD Studio viewer" aria-label="Open in MD Studio viewer">View</button><button data-open-editor-path="' + escapeHtml(document.path) + '" title="Open in editor" aria-label="Open in editor">Edit</button><button class="wide" data-show-overview type="button" title="Back to full graph overview" aria-label="Back to full graph overview">&#8617; All</button></div>'
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
      details.innerHTML = '<div class="block stage"><span class="kicker">Source Graph failed</span><strong>Webview initialization stopped</strong><small>' + escapeHtml(message) + '</small><div class="hint">Close this tab and run MD Studio: Open Source Graph again. If it repeats, run MD Studio: Check Codex Source Graph MCP Status.</div></div>';
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
