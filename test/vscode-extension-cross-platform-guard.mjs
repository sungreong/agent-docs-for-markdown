import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const extensionPackage = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const extensionSource = await readFile(new URL('../vscode-extension/src/extension.ts', import.meta.url), 'utf8');
const sourceGraphSource = await readFile(new URL('../vscode-extension/src/commands/sourceGraph.ts', import.meta.url), 'utf8');
const sourceIgnoreSource = await readFile(new URL('../vscode-extension/src/utils/sourceIgnore.ts', import.meta.url), 'utf8');
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
const sourceGraphCliQa = await readFile(new URL('../docs/planning/source-graph-cli-skill-qa.md', import.meta.url), 'utf8');
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
  'dist/**/*.js',
  'scripts/md-to-html.mjs',
  'scripts/source-graph.mjs',
  'public/core/**',
  'public/document.css',
  'public/template-builder-vscode.html',
  'ai_skills/**',
  'node_modules/sql.js/package.json',
  'node_modules/sql.js/LICENSE',
  'node_modules/sql.js/dist/sql-wasm.js',
  'node_modules/sql.js/dist/sql-wasm.wasm',
  'node_modules/yazl/package.json',
  'node_modules/yazl/LICENSE',
  'node_modules/yazl/index.js',
  'node_modules/buffer-crc32/package.json',
  'node_modules/buffer-crc32/LICENSE',
  'node_modules/buffer-crc32/index.js',
]) {
  assert(packagedFiles.has(expected), `VSIX files must include ${expected}`);
}
assert(
  !packagedFiles.has('dist/**'),
  'VSIX package should include runtime JS only rather than generated source maps',
);
for (const forbidden of [
  'server.js',
  'public/index.html',
  'public/app.js',
  'public/styles.css',
  'public/template-builder.html',
]) {
  assert(!packagedFiles.has(forbidden), `VSIX package should not include GitHub-only local web editor file ${forbidden}`);
}
assert(
  !packagedFiles.has('node_modules/sql.js/**') &&
    !packagedFiles.has('node_modules/yazl/**') &&
    !packagedFiles.has('node_modules/buffer-crc32/**'),
  'VSIX package should include only required runtime dependency files, not whole dependency folders',
);
assert.equal(
  extensionPackage.scripts?.['smoke:source-graph'],
  'node ./tools/smoke-source-graph-runtime.mjs',
  'VSIX build should include a Source Graph runtime smoke test for sqlite/wasm dependencies',
);
assert(
  extensionPackage.scripts?.build?.includes('npm run smoke:source-graph'),
  'Build should run the Source Graph runtime smoke test before packaging',
);
assert(
  extensionPackage.contributes?.viewsContainers?.activitybar?.some(
    (container) =>
      container.id === 'markdownAgentDocsContainer' &&
      container.title === 'Agent Docs' &&
      container.icon === 'assets/activity-md.svg',
  ),
  'Agent Docs should use one Library activity bar container for files and graph views',
);
assert(
  Array.isArray(extensionPackage.contributes?.views?.markdownAgentDocsContainer) &&
    extensionPackage.contributes.views.markdownAgentDocsContainer.some((view) => view.id === 'markdownAgentDocsFileBrowser') &&
    extensionPackage.contributes.views.markdownAgentDocsContainer.some((view) => view.id === 'markdownAgentDocsSourceGraphLauncher'),
  'Agent Docs should contain both the file browser and Source Graph launcher views',
);
assert.deepEqual(
  extensionPackage.contributes.views.markdownAgentDocsContainer.map((view) => view.id),
  ['markdownAgentDocsSourceGraphLauncher', 'markdownAgentDocsFileBrowser'],
  'Source Graph should appear above the file browser in the Agent Docs sidebar',
);
const viewTitleMenus = extensionPackage.contributes?.menus?.['view/title'] || [];
assert(
  !viewTitleMenus.some(
    (menu) => menu.command === 'markdownAgentDocs.openSourceGraph' && menu.when === 'view == markdownAgentDocsFileBrowser',
  ),
  'Agent Docs Files title bar should not duplicate the Source Graph launcher action',
);
assert(
  viewTitleMenus.some(
    (menu) => menu.command === 'markdownAgentDocs.openSourceGraph' && menu.when === 'view == markdownAgentDocsSourceGraphLauncher',
  ),
  'Source Graph view title bar should keep its Open Source Graph action',
);
const sourceGraphTitleCommands = viewTitleMenus
  .filter((menu) => menu.when === 'view == markdownAgentDocsSourceGraphLauncher')
  .map((menu) => menu.command);
assert.deepEqual(
  sourceGraphTitleCommands,
  ['markdownAgentDocs.openSourceGraph'],
  'Source Graph view title bar should expose only the primary Open Graph action',
);
assert(
  viewTitleMenus.some(
    (menu) =>
      menu.command === 'markdownAgentDocs.downloadSkillFolder' &&
      menu.when === 'view == markdownAgentDocsFileBrowser' &&
      menu.group === 'navigation@0',
  ),
  'Agent Docs Files title bar should expose the bundled skills download/install action before search',
);
const commandPaletteMenus = extensionPackage.contributes?.menus?.commandPalette || [];
const hiddenPaletteCommands = new Set(
  commandPaletteMenus.filter((menu) => menu.when === 'false').map((menu) => menu.command),
);
for (const contextOnlyCommand of [
  'markdownAgentDocs.refresh',
  'markdownAgentDocs.openSourceEditor',
  'markdownAgentDocs.enableAutoOnSave',
  'markdownAgentDocs.disableAutoOnSave',
  'markdownAgentDocs.openSourceIgnoreFile',
  'markdownAgentDocs.focusFolder',
  'markdownAgentDocs.clearFolderFocus',
  'markdownAgentDocs.openFileInViewer',
  'markdownAgentDocs.openFileInNewPanel',
  'markdownAgentDocsFileBrowser.refresh',
  'markdownAgentDocsFileBrowser.openInEditor',
  'markdownAgentDocsFileBrowser.search',
  'markdownAgentDocsFileBrowser.sort',
  'markdownAgentDocsFileBrowser.filter',
  'markdownAgentDocsFileBrowser.configureExtensions',
  'markdownAgentDocsFileBrowser.pinToTop',
  'markdownAgentDocsFileBrowser.unpin',
  'markdownAgentDocsFileBrowser.copyPath',
  'markdownAgentDocsFileBrowser.copyRelativePath',
  'markdownAgentDocsFileBrowser.copyFileName',
  'markdownAgentDocsFileBrowser.hideItem',
  'markdownAgentDocsFileBrowser.delete',
  'markdownAgentDocsFileBrowser.manageHidden',
]) {
  assert(hiddenPaletteCommands.has(contextOnlyCommand), `${contextOnlyCommand} should stay out of the Command Palette`);
}
for (const topLevelCommand of [
  'markdownAgentDocs.open',
  'markdownAgentDocs.openTemplateBuilder',
  'markdownAgentDocs.openSourceGraph',
  'markdownAgentDocs.initializeSourceGraphWorkspace',
  'markdownAgentDocs.updateSourceGraph',
  'markdownAgentDocs.searchSourceGraph',
  'markdownAgentDocs.downloadSkillFolder',
  'markdownAgentDocs.diagnoseEnvironment',
  'markdownAgentDocs.transformMarkdownToHtml',
]) {
  assert(!hiddenPaletteCommands.has(topLevelCommand), `${topLevelCommand} should remain available in the Command Palette`);
}
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
assert(
  !extensionPackage.activationEvents?.includes('onCommand:markdownAgentDocs.installSourceGraphSkill') &&
    !(extensionPackage.contributes?.commands || []).some((command) => command.command === 'markdownAgentDocs.installSourceGraphSkill') &&
    !sourceGraphSource.includes('installSourceGraphSkill'),
  'Source Graph should not expose a separate Agent Skill command; use the top bundled skills download flow',
);
assert.doesNotMatch(
  sourceGraphSource,
  /(cmd\.exe|powershell|pwsh|\/bin\/bash|\.cmd['"`])/i,
  'Source Graph extension code should not require a platform-specific shell',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:markdownAgentDocs.initializeSourceGraphWorkspace'),
  'Initialize Source Graph Workspace should activate the extension',
);
assert(
  (extensionPackage.contributes?.commands || []).some(
    (command) => command.command === 'markdownAgentDocs.initializeSourceGraphWorkspace',
  ),
  'Initialize Source Graph Workspace should be contributed as a command',
);
assert(
  sourceGraphSource.includes("registerSourceGraphCommand('markdownAgentDocs.initializeSourceGraphWorkspace'"),
  'Initialize Source Graph Workspace should be registered',
);
assert(
  sourceGraphSource.includes('data-action="initializeGraph"'),
  'Source Graph launcher should expose an initialize DB button',
);
assert(
  sourceGraphSource.includes('data-action="runAudit"') &&
    sourceGraphSource.includes('Run Workspace Audit') &&
    sourceGraphSource.includes("message.type === 'launcherAuditResults'") &&
    sourceGraphSource.includes('addIgnorePatternFromLauncher') &&
    sourceGraphSource.includes('data-add-ignore-pattern') &&
    sourceGraphSource.includes('addIgnorePatternsFromLauncher') &&
    sourceGraphSource.includes('Apply Selected') &&
    sourceGraphSource.includes('initializeGraphGuided'),
  'Source Graph launcher should expose the audit flow, batch ignore actions, and guided first-run setup',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:markdownAgentDocs.openSourceIgnoreFile') &&
    (extensionPackage.contributes?.commands || []).some((command) => command.command === 'markdownAgentDocs.openSourceIgnoreFile'),
  'Edit Source Ignore should activate and contribute a command',
);
assert(
  sourceGraphSource.includes('No .mps/source-graph.sqlite exists for this workspace yet.') &&
    sourceGraphSource.includes('run Agent Docs: Initialize Source Graph'),
  'Source Graph missing-DB copy should guide users to the explicit workspace initialization command',
);
assert(
  sourceGraphSource.includes('open .mpsignore, and then show ignore candidates') &&
    sourceGraphSource.includes('batch-apply ignore candidates before asking an agent to update or reorganize Markdown documents.') &&
    sourceGraphSource.includes('buildSourceIgnoreTemplate') &&
    sourceGraphSource.includes('ensureSourceIgnoreFile') &&
    (sourceGraphSource.includes('No visible ignore candidates remain. Already applied recommendations are hidden automatically.') ||
      sourceGraphSource.includes('No visible ignore candidates remain. Already applied entries are hidden automatically.')),
  'Source Graph launcher should explain the guided setup flow, hide already-applied recommendations, and reuse the same .mpsignore bootstrap template',
);
assert(
  sourceIgnoreSource.includes("export const MPS_IGNORE_FILE = '.mps/.mpsignore'") &&
    sourceIgnoreSource.includes('export const MPS_IGNORE_FILES = [MPS_IGNORE_FILE]') &&
    sourceIgnoreSource.includes('await ensureSourceIgnoreFile(workspaceFolder)') &&
    sourceIgnoreSource.includes('await fs.mkdir(path.dirname(ignorePath), { recursive: true })') &&
    !sourceIgnoreSource.includes('LEGACY_MPS_IGNORE_FILE') &&
    !sourceGraphSource.includes('LEGACY_MPS_IGNORE_FILE'),
  'Source ignore should always create and read the canonical .mps/.mpsignore file without a legacy root .mpsignore fallback',
);
assert(
  exportSkillFolderSource.includes('workspaceSkillsDir && await hasExportableSkill(workspaceSkillsDir)'),
  'Download Skill Folder should not offer a missing or empty workspace skillsDir as a source',
);
assert(
  (extensionPackage.contributes?.commands || []).some(
    (command) =>
      command.command === 'markdownAgentDocs.downloadSkillFolder' &&
      command.title === 'Agent Docs: Install or Export Skills',
  ) &&
    exportSkillFolderSource.includes('async function pickSkillWorkflow') &&
    exportSkillFolderSource.includes("label: 'Install bundled skills to this workspace'") &&
    exportSkillFolderSource.includes('async function pickBundledInstallPlans') &&
    exportSkillFolderSource.includes('canPickMany: true') &&
    exportSkillFolderSource.includes("bundledSourcesByProfile.get('codex')") &&
    exportSkillFolderSource.includes('Uses ${plan.source.label} because no matching bundled set exists yet.') &&
    exportSkillFolderSource.includes('Choose Claude, Agents, Codex, Gemini, Cursor targets') &&
    exportSkillFolderSource.includes('async function installBundledSkillsToMatchingWorkspace') &&
    exportSkillFolderSource.includes('skillAgentProfileForSource(source)') &&
    exportSkillFolderSource.includes("createOutputChannel('Agent Docs Skills')") &&
    exportSkillFolderSource.includes("channel.appendLine('Installed')") &&
    exportSkillFolderSource.includes("channel.appendLine('Skipped')") &&
    exportSkillFolderSource.includes("channel.appendLine('Failed')") &&
    exportSkillFolderSource.includes("channel.appendLine('Next')") &&
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
  /Install Codex|Check Codex|connect Codex/,
  'Source Graph UI should not describe Codex-only server setup',
);
assert(
  extensionReadme.includes('Run Workspace Audit') &&
    extensionReadme.includes('Apply Selected') &&
    extensionReadme.includes('Start Graph will build the first index') &&
    extensionReadme.includes('sidebar `Run Workspace Audit` flow'),
  'VS Code README should describe the launcher audit workflow, guided setup, and batch ignore actions',
);
for (const [name, doc] of [['README', extensionReadme], ['guide', extensionGuide]]) {
  assert.doesNotMatch(
    doc,
    /Browser Studio|Local Web Editor|npm start|localhost:3188|server\.js|public\/index\.html/i,
    `VS Code extension ${name} should not document the GitHub-only local web editor`,
  );
}

assert(
  buildTemplateBuilderSource.includes("css.replace(/\\\\/g, '\\\\\\\\')") &&
    buildTemplateBuilderSource.includes("public/template-builder.html") &&
    buildTemplateBuilderSource.includes("public/template-builder-vscode.html"),
  'Template builder bundler must escape backslashes and write only the VS Code-dedicated HTML artifact',
);
assert(
  syncBundleSource.includes("public/core/ignore-rules.js"),
  'VSIX bundle sync should copy shared ignore rules',
);
assert(
  syncBundleSource.includes('public/template-builder-vscode.html is VSCode-dedicated; do NOT sync from repo root'),
  'VSIX bundle sync should keep the GitHub-only local web editor separate from VS Code webview assets',
);
assert(
    fileBrowserProviderSource.includes('filterIgnoredUris') &&
    fileBrowserProviderSource.includes('loadSourceIgnoreMatcher') &&
    fileBrowserProviderSource.includes('MPS_IGNORE_FILE') &&
    fileBrowserProviderSource.includes('MPS_IGNORE_FILES') &&
    fileBrowserProviderSource.includes('findSourceIgnoreFiles') &&
    fileBrowserProviderSource.includes('relativePath === MPS_IGNORE_FILE'),
  'Agent Docs File Browser should show .mps/.mpsignore while filtering files through .mpsignore rules',
);
assert(
  fileBrowserProviderSource.includes('MANAGED_ROOT_KEY') &&
    fileBrowserProviderSource.includes('prependManagedRoot') &&
    fileBrowserProviderSource.includes("pickLocalized(this.language, { en: 'Managed'") &&
    fileBrowserProviderSource.includes('Quick access to .mpsignore and workspace agent control docs'),
  'Agent Docs File Browser should surface managed workspace control files in a dedicated top section',
);
assert(
  fileBrowserProviderSource.includes('createLoadingItem()') &&
    fileBrowserProviderSource.includes("vscode.Uri.parse('markdown-agent-docs-file-browser:/loading')") &&
    fileBrowserProviderSource.includes('this.refreshPromise && this.roots.length === 0') &&
    fileBrowserProviderSource.includes('private async runRefreshLoop()') &&
    fileBrowserProviderSource.includes('this.pendingRefresh = true'),
  'Agent Docs File Browser should show an immediate loading row and coalesce overlapping refreshes',
);
assert(
  extensionPackage.activationEvents?.includes('onCommand:markdownAgentDocsFileBrowser.delete') &&
    (extensionPackage.contributes?.commands || []).some((command) => command.command === 'markdownAgentDocsFileBrowser.delete') &&
    (extensionPackage.contributes?.keybindings || []).some(
      (keybinding) =>
        keybinding.command === 'markdownAgentDocsFileBrowser.delete' &&
        keybinding.key === 'delete' &&
        /focusedView == markdownAgentDocsFileBrowser/.test(keybinding.when || ''),
    ) &&
    (extensionPackage.contributes?.menus?.['view/item/context'] || []).some(
      (item) => item.command === 'markdownAgentDocsFileBrowser.delete' && /viewItem == mdFolder/.test(item.when || ''),
    ),
  'Agent Docs File Browser should contribute Delete key and context-menu deletion for files/folders',
);
assert(
  fileBrowserRegisterSource.includes("registerCommand('markdownAgentDocsFileBrowser.delete'") &&
    fileBrowserRegisterSource.includes('treeView.selection[0]?.resourceUri') &&
    fileBrowserRegisterSource.includes('vscode.workspace.fs.delete(uri, { recursive: isDirectory, useTrash: true })') &&
    fileBrowserRegisterSource.includes('vscode.workspace.getWorkspaceFolder(uri)'),
  'Agent Docs File Browser delete should use the selected tree item, stay inside the workspace, and move items to Trash',
);
assert(
  sourceGraphSource.includes('isSourceIgnoredUri') && sourceGraphSource.includes('MPS_IGNORE_FILE'),
  'Source Graph watcher should skip ignored markdown and rebuild when .mpsignore changes',
);
for (const doc of [extensionGuide, extensionReadme]) {
  assert(
    doc.includes('Agent Docs: Initialize Source Graph'),
    'User docs should explain Source Graph workspace initialization',
  );
  assert(
    doc.includes('.mps/source-graph.sqlite'),
    'User docs should name the workspace-local graph DB path',
  );
  assert(
    doc.includes('Agent Docs: Install or Export Skills') &&
      doc.includes('Install bundled skills to this workspace') &&
      doc.includes('node scripts/source-graph.mjs search'),
    'User docs should explain bundled Markdown workspace search skill setup and CLI search',
  );
  assert(
    doc.includes('markdown-workspace-search'),
    'User docs should mention the bundled Codex markdown workspace search skill',
  );
  assert(
    doc.includes('--include-headings'),
    'User docs should tell users to include heading evidence in CLI search results',
  );
  assert(
    doc.includes('--include-links') && doc.includes('--links-depth 1') && doc.includes('--include-headings'),
    'User docs should verify Source Graph CLI search with linked context and headings, not only a flat search',
  );
  assert(
    doc.includes('Why it matters') && doc.includes('Heading evidence') && doc.includes('Link evidence') && doc.includes('Next action'),
    'User docs should ask agents to summarize Source Graph answers with evidence fields',
  );
  assert(
    doc.includes('.mpsignore') && doc.includes('Agent Docs: Edit Source Ignore'),
    'User docs should explain source ignore patterns',
  );
}

for (const expected of [
  'Source Graph CLI Skill QA',
  'node scripts/source-graph.mjs update',
  'node scripts/source-graph.mjs search',
  'node scripts/source-graph.mjs related',
  'node scripts/source-graph.mjs neighbors',
  'Agent skill roots',
  'CLI command execution',
  '--include-links',
  '--links-depth 1',
  '--include-headings',
  'Why it matters',
  'Heading evidence',
  'Link evidence',
  'Next action',
  '--include-copies',
  'It is not a code symbol graph.',
]) {
  assert(sourceGraphCliQa.includes(expected), `Source Graph CLI Skill QA checklist should include ${expected}`);
}

console.log('vscode extension cross-platform guard passed');
