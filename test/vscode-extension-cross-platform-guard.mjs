import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const extensionPackage = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const extensionSource = await readFile(new URL('../vscode-extension/src/extension.ts', import.meta.url), 'utf8');
const sourceGraphSource = await readFile(new URL('../vscode-extension/src/commands/sourceGraph.ts', import.meta.url), 'utf8');
const fileBrowserProviderSource = await readFile(
  new URL('../vscode-extension/src/providers/markdownFileTreeProvider.ts', import.meta.url),
  'utf8',
);
const fileBrowserRegisterSource = await readFile(
  new URL('../vscode-extension/src/fileBrowser/registerMarkdownFileBrowser.ts', import.meta.url),
  'utf8',
);
const extensionGuide = await readFile(new URL('../vscode-extension/EXTENSION_GUIDE.md', import.meta.url), 'utf8');
const extensionReadme = await readFile(new URL('../vscode-extension/README.md', import.meta.url), 'utf8');
const buildTemplateBuilderSource = await readFile(
  new URL('../vscode-extension/tools/build-tb-vscode.mjs', import.meta.url),
  'utf8',
);
const syncBundleSource = await readFile(new URL('../vscode-extension/tools/sync-cli-bundle.mjs', import.meta.url), 'utf8');
const exportSkillFolderSource = await readFile(
  new URL('../vscode-extension/src/commands/exportSkillFolder.ts', import.meta.url),
  'utf8',
);
const sourceGraphActivityIcon = await readFile(
  new URL('../vscode-extension/assets/activity-source-graph.svg', import.meta.url),
  'utf8',
);

const packagedFiles = new Set(extensionPackage.files || []);
for (const expected of [
  'assets/activity-source-graph.svg',
  'dist/**',
  'scripts/md-to-html.mjs',
  'scripts/source-graph.mjs',
  'public/core/**',
  'public/document.css',
  'public/template-builder-vscode.html',
  'ai_skills/**',
]) {
  assert(packagedFiles.has(expected), `VSIX files must include ${expected}`);
}
assert(
  extensionPackage.contributes?.viewsContainers?.activitybar?.some(
    (container) =>
      container.id === 'mdStudioSourceGraphContainer' &&
      container.icon === 'assets/activity-source-graph.svg',
  ),
  'Source Graph activity bar container should use the custom MD graph icon asset',
);
assert(
  sourceGraphActivityIcon.includes('aria-label="MD Source Graph"') &&
    sourceGraphActivityIcon.includes('M3.3 16.6V7.2') &&
    sourceGraphActivityIcon.includes('M13.75 16.6V7.2') &&
    sourceGraphActivityIcon.includes('opacity=".36"'),
  'Source Graph activity icon should prioritize large MD letters and keep graph marks secondary',
);

assert.match(
  sourceGraphSource,
  /cp\.spawn\(command,\s*args,\s*\{\s*cwd,\s*shell:\s*false,\s*windowsHide:\s*true\s*\}\)/,
  'Source Graph should spawn commands with an args array and shell:false for Windows/Linux/macOS quoting',
);
assert.match(
  sourceGraphSource,
  /cp\.spawn\(command,\s*args,\s*\{\s*cwd,\s*shell:\s*false,\s*windowsHide:\s*true\s*\}\)/,
  'Source Graph capture should avoid shell-specific command parsing',
);
assert.match(
  sourceGraphSource,
  /path\.join\(os\.homedir\(\),\s*'\.codex',\s*'config\.toml'\)/,
  'User Codex config path should be based on os.homedir(), not a Windows/macOS/Linux literal',
);
assert.match(
  sourceGraphSource,
  /path\.join\(workspaceFolder\.uri\.fsPath,\s*'\.codex',\s*'config\.toml'\)/,
  'Workspace Codex config path should use path.join with the VS Code fsPath',
);
assert.match(
  sourceGraphSource,
  /args = \["\$\{escapeTomlString\(scriptPath\)\}", "mcp", "--root", "\$\{escapeTomlString\(root\)\}"\]/,
  'MCP config should write an args array instead of a platform-specific shell command',
);
assert.doesNotMatch(
  sourceGraphSource,
  /(cmd\.exe|powershell|pwsh|\/bin\/bash|\.cmd['"`])/i,
  'Source Graph extension code should not require a platform-specific shell',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:mdStudioPreview.initializeSourceGraphWorkspace'),
  'Initialize Source Graph Workspace should activate the extension',
);
assert(
  (extensionPackage.contributes?.commands || []).some(
    (command) => command.command === 'mdStudioPreview.initializeSourceGraphWorkspace',
  ),
  'Initialize Source Graph Workspace should be contributed as a command',
);
assert(
  sourceGraphSource.includes("registerSourceGraphCommand('mdStudioPreview.initializeSourceGraphWorkspace'"),
  'Initialize Source Graph Workspace should be registered',
);
assert(
  sourceGraphSource.includes('data-action="initializeGraph"'),
  'Source Graph launcher should expose an initialize DB button',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:mdStudioPreview.openSourceIgnoreFile') &&
    (extensionPackage.contributes?.commands || []).some((command) => command.command === 'mdStudioPreview.openSourceIgnoreFile'),
  'Edit Source Ignore should activate and contribute a command',
);
assert(
  sourceGraphSource.includes("missing - run MD Studio: Initialize Source Graph Workspace"),
  'MCP status should guide users to the explicit workspace initialization command when the DB is missing',
);
const installStart = sourceGraphSource.indexOf('async function installCodexMcp');
const installEnd = sourceGraphSource.indexOf('async function checkCodexMcpStatus', installStart);
const installBlock = sourceGraphSource.slice(installStart, installEnd);
assert(installStart >= 0 && installEnd > installStart, 'installCodexMcp should be present');
assert(
  installBlock.indexOf('await updateSourceGraphIndex(context, workspaceFolder);') <
    installBlock.indexOf('await upsertManagedMcpBlock'),
  'Install Source Graph MCP should create/update the graph DB before writing MCP config blocks',
);
assert(
  installBlock.includes("getMcpServerName(workspaceFolder, 'workspace')") &&
    installBlock.includes("getCodexConfigPath(workspaceFolder, 'workspace')") &&
    installBlock.includes('getWorkspaceMcpJsonPath(workspaceFolder)') &&
    installBlock.includes('await pickMcpInstallTarget') &&
    installBlock.includes("target === 'all' || target === 'mcp-json'") &&
    installBlock.includes("target === 'all' || target === 'codex'") &&
    !installBlock.includes('pickCodexConfigTarget'),
  'Install Source Graph MCP should ask whether to update Claude/generic MCP, Codex, or all clients',
);
assert(
  installBlock.includes('await ensureWorkspaceMcpSkillFolders(context, workspaceFolder);') &&
    sourceGraphSource.includes("targetPathSegments: ['.claude', 'skills']") &&
    sourceGraphSource.includes("targetPathSegments: ['.agents', 'skills']") &&
    sourceGraphSource.includes("targetPathSegments: ['.codex', 'skills']") &&
    sourceGraphSource.includes('resolveWorkspaceConfiguredSkillsDir'),
  'Install Source Graph MCP should prepare workspace agent skill roots and the configured skillsDir',
);
assert(
  exportSkillFolderSource.includes('workspaceSkillsDir && await hasExportableSkill(workspaceSkillsDir)'),
  'Download Skill Folder should not offer a missing or empty workspace skillsDir as a source',
);
assert(
  (extensionPackage.contributes?.commands || []).some(
    (command) =>
      command.command === 'mdStudioPreview.downloadSkillFolder' &&
      command.title === 'MD Studio: Install or Export Skills',
  ) &&
    exportSkillFolderSource.includes('async function pickSkillWorkflow') &&
    exportSkillFolderSource.includes("label: 'Install bundled skills to this workspace'") &&
    exportSkillFolderSource.includes('async function installBundledSkillsToMatchingWorkspace') &&
    exportSkillFolderSource.includes('skillAgentProfileForSource(source)') &&
    exportSkillFolderSource.includes('Choose a skill root folder such as .claude/skills') &&
    extensionReadme.includes('Install bundled skills to this workspace') &&
    extensionGuide.includes('Install bundled skills to this workspace'),
  'Skill install/export UX should lead with bundled-to-matching-workspace install and guard against selecting individual skill folders',
);
assert(
  extensionSource.includes('isSessionAlive(session)') &&
    extensionSource.includes('isWebviewDisposedError(error)') &&
    extensionSource.includes('safeSetPanelStatus(session') &&
    extensionSource.includes('safeSetWebviewHtml(session') &&
    extensionSource.includes('safeSetWebviewOptions(session'),
  'Preview rendering should ignore disposed webviews instead of surfacing Webview is disposed errors',
);
assert.doesNotMatch(
  sourceGraphSource,
  /Codex MCP|Codex Source Graph MCP|Install Codex|Check Codex|connect Codex/,
  'Source Graph UI should describe generic MCP, not Codex-only MCP',
);

assert(
  buildTemplateBuilderSource.includes("css.replace(/\\\\/g, '\\\\\\\\')"),
  'Template builder bundler must escape backslashes with a valid JS regex',
);
assert(
  syncBundleSource.includes("public/core/ignore-rules.js"),
  'VSIX bundle sync should copy shared ignore rules',
);
assert(
  fileBrowserProviderSource.includes('filterIgnoredUris') &&
    fileBrowserProviderSource.includes('loadSourceIgnoreMatcher') &&
    fileBrowserProviderSource.includes('MPS_IGNORE_FILE') &&
    fileBrowserProviderSource.includes('findSourceIgnoreFiles') &&
    fileBrowserProviderSource.includes('relativePath === MPS_IGNORE_FILE'),
  'MD Studio File Browser should show the root .mpsignore while filtering files through .mpsignore rules',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:mdStudioFileBrowser.delete') &&
    (extensionPackage.contributes?.commands || []).some((command) => command.command === 'mdStudioFileBrowser.delete') &&
    (extensionPackage.contributes?.keybindings || []).some(
      (keybinding) =>
        keybinding.command === 'mdStudioFileBrowser.delete' &&
        keybinding.key === 'delete' &&
        /focusedView == mdStudioFileBrowser/.test(keybinding.when || ''),
    ) &&
    (extensionPackage.contributes?.menus?.['view/item/context'] || []).some(
      (item) => item.command === 'mdStudioFileBrowser.delete' && /viewItem == mdFolder/.test(item.when || ''),
    ),
  'MD Studio File Browser should contribute Delete key and context-menu deletion for files/folders',
);
assert(
  fileBrowserRegisterSource.includes("registerCommand('mdStudioFileBrowser.delete'") &&
    fileBrowserRegisterSource.includes('treeView.selection[0]?.resourceUri') &&
    fileBrowserRegisterSource.includes('vscode.workspace.fs.delete(uri, { recursive: isDirectory, useTrash: true })') &&
    fileBrowserRegisterSource.includes('vscode.workspace.getWorkspaceFolder(uri)'),
  'MD Studio File Browser delete should use the selected tree item, stay inside the workspace, and move items to Trash',
);
assert(
  sourceGraphSource.includes('isSourceIgnoredUri') && sourceGraphSource.includes('MPS_IGNORE_FILE'),
  'Source Graph watcher should skip ignored markdown and rebuild when .mpsignore changes',
);
for (const doc of [extensionGuide, extensionReadme]) {
  assert(
    doc.includes('MD Studio: Initialize Source Graph Workspace'),
    'User docs should explain Source Graph workspace initialization',
  );
  assert(
    doc.includes('.mps/source-graph.sqlite'),
    'User docs should name the workspace-local graph DB path',
  );
  assert(
    doc.includes('MD Studio: Install Source Graph MCP') &&
      doc.includes('.mcp.json') &&
      doc.includes('.codex/config.toml'),
    'User docs should explain selectable Source Graph MCP client setup',
  );
  assert(
    doc.includes('source-graph-search'),
    'User docs should mention the bundled Codex source graph skill',
  );
  assert(
    doc.includes('.mpsignore') && doc.includes('MD Studio: Edit Source Ignore'),
    'User docs should explain source ignore patterns',
  );
}

console.log('vscode extension cross-platform guard passed');
