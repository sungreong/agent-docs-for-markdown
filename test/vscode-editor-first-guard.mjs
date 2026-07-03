import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const commands = packageJson.contributes?.commands ?? [];
const editorTitleMenus = packageJson.contributes?.menus?.['editor/title'] ?? [];
const fileBrowserItemMenus = packageJson.contributes?.menus?.['view/item/context'] ?? [];
assert(
  commands.some((item) => item.command === 'markdownAgentDocs.openSourceEditor'),
  'Open Source Editor command should be contributed',
);
assert(
  packageJson.activationEvents?.includes('onCommand:markdownAgentDocs.openSourceEditor'),
  'Open Source Editor command should activate the extension',
);
assert(
  packageJson.activationEvents?.includes('onCommand:markdownAgentDocs.enableAutoOnSave') &&
    packageJson.activationEvents?.includes('onCommand:markdownAgentDocs.disableAutoOnSave'),
  'Auto refresh on/off commands should activate the extension',
);
assert(
  editorTitleMenus.some(
    (item) =>
      item.command === 'markdownAgentDocs.openSourceEditor' &&
      item.when === "activeWebviewPanelId == 'markdownAgentDocs' || activeWebviewPanelId == 'markdown.preview'",
  ),
  'Open Source Editor should appear in Agent Docs and built-in markdown preview tab title actions',
);
assert(
  editorTitleMenus.some(
    (item) =>
      item.command === 'markdownAgentDocs.disableAutoOnSave' &&
      item.when ===
        "(activeWebviewPanelId == 'markdownAgentDocs' || activeWebviewPanelId == 'markdown.preview') && markdownAgentDocs.autoOnSaveEnabled",
  ),
  'Auto Refresh On should appear in Agent Docs and built-in markdown preview tab title actions',
);
assert(
  editorTitleMenus.some(
    (item) =>
      item.command === 'markdownAgentDocs.enableAutoOnSave' &&
      item.when ===
        "(activeWebviewPanelId == 'markdownAgentDocs' || activeWebviewPanelId == 'markdown.preview') && !markdownAgentDocs.autoOnSaveEnabled",
  ),
  'Auto Refresh Off should appear in Agent Docs and built-in markdown preview tab title actions',
);

const itemSource = await readFile(
  new URL('../vscode-extension/src/providers/markdownFileItem.ts', import.meta.url),
  'utf8',
);
assert.match(
  itemSource,
  /command:\s*'markdownAgentDocs\.openFileInViewer'/,
  'Agent Docs File Browser markdown items should open in the viewer by default',
);
assert.doesNotMatch(
  itemSource,
  /command:\s*'markdownAgentDocsFileBrowser\.openInEditor'/,
  'Markdown row clicks should not open the editor unless edit is explicitly requested',
);

const browserSource = await readFile(
  new URL('../vscode-extension/src/fileBrowser/registerMarkdownFileBrowser.ts', import.meta.url),
  'utf8',
);
const searchCommandStart = browserSource.indexOf("vscode.commands.registerCommand('markdownAgentDocsFileBrowser.search'");
assert.notEqual(searchCommandStart, -1, 'Search command should remain registered');
const searchCommandEnd = browserSource.indexOf('  return {', searchCommandStart);
const searchCommandBlock = browserSource.slice(searchCommandStart, searchCommandEnd);
assert.match(
  searchCommandBlock,
  /isPreviewableFileUri\(picked\)/,
  'Search-picked previewable files should follow browser viewer behavior',
);
assert.match(
  searchCommandBlock,
  /options\.openInViewer\(picked\)/,
  'Search-picked markdown files should open in the viewer by default',
);
assert.match(
  searchCommandBlock,
  /options\.openInEditor\(picked\)/,
  'Search-picked non-markdown files should still open in the editor',
);
const openFileInViewerStart = browserSource.indexOf("vscode.commands.registerCommand('markdownAgentDocs.openFileInViewer'");
assert.notEqual(openFileInViewerStart, -1, 'Open File in Viewer command should remain registered');
const openFileInViewerEnd = browserSource.indexOf("vscode.commands.registerCommand('markdownAgentDocs.openFileInNewPanel'", openFileInViewerStart);
const openFileInViewerBlock = browserSource.slice(openFileInViewerStart, openFileInViewerEnd);
assert.match(
  openFileInViewerBlock,
  /try\s*\{[\s\S]*options\.openInViewer\(uri\)[\s\S]*\}\s*catch\s*\{[\s\S]*options\.openInEditor\(uri\)/,
  'File browser row clicks should fall back to the editor if the viewer cannot open a file',
);
assert(
  !fileBrowserItemMenus.some(
    (item) => item.command === 'markdownAgentDocs.openFileInNewPanel' && item.group === 'inline',
  ),
  'Markdown rows should not show an inline preview button that can accidentally open a slow new viewer tab',
);
assert(
  fileBrowserItemMenus.some(
    (item) =>
      item.command === 'markdownAgentDocsFileBrowser.openInEditor' &&
      item.group === 'inline' &&
      /viewItem == mdFile/.test(item.when ?? ''),
  ),
  'Markdown rows should show an inline edit action for explicit editing',
);

const extensionSource = await readFile(new URL('../vscode-extension/src/extension.ts', import.meta.url), 'utf8');
const treeProviderSource = await readFile(
  new URL('../vscode-extension/src/providers/markdownFileTreeProvider.ts', import.meta.url),
  'utf8',
);
const previewFunctionStart = extensionSource.indexOf('async function previewDocument');
assert.notEqual(previewFunctionStart, -1, 'previewDocument should exist');
const previewFunctionEnd = extensionSource.indexOf('function ensureSessionForUri', previewFunctionStart);
const previewFunctionBlock = extensionSource.slice(previewFunctionStart, previewFunctionEnd);
const saveGuardIndex = previewFunctionBlock.indexOf("if (reason === 'save' && !sessions.has(key)) return;");
const ensureSessionIndex = previewFunctionBlock.indexOf('ensureSessionForUri(document');
assert(saveGuardIndex >= 0, 'Save refresh should skip files that do not already have a preview session');
assert(
  saveGuardIndex < ensureSessionIndex,
  'Save refresh guard must run before ensureSession so Ctrl+S cannot create a new viewer',
);
assert.match(
  extensionSource,
  /executeCommand\('markdown\.showSource'\)/,
  'Open Source Editor should try VS Code markdown preview source switching',
);
assert.match(
  extensionSource,
  /setContext',\s*autoOnSaveContextKey,\s*readConfig\(\)\.autoOnSave/,
  'Auto refresh setting should be mirrored into a VS Code context key for title buttons',
);
assert.match(
  extensionSource,
  /openPreferredViewForCurrentMarkdown\(enabled\)/,
  'Auto refresh on/off should immediately switch the active markdown view priority',
);
const activateStart = extensionSource.indexOf('export function activate');
const activateEnd = extensionSource.indexOf('export function deactivate', activateStart);
const activateBlock = extensionSource.slice(activateStart, activateEnd);
assert.doesNotMatch(
  activateBlock,
  /createOutputChannel\('Agent Docs for Markdown'\)/,
  'Activation should not create the Output Channel until logging is needed',
);
assert.match(
  extensionSource,
  /function ensureOutputChannel\(\): vscode\.OutputChannel/,
  'Output Channel should be created lazily for diagnostics and CLI logs',
);
assert.doesNotMatch(
  extensionSource,
  /import \{ downloadSkillFolderCommand \} from '\.\/commands\/exportSkillFolder\.js';/,
  'Skill install/export command module should not load during extension activation',
);
assert.doesNotMatch(
  extensionSource,
  /import \{ openTemplateBuilderCommand \} from '\.\/commands\/templateBuilder\.js';/,
  'Template Builder command module should not load during extension activation',
);
assert.match(
  extensionSource,
  /loadTemplateBuilderCommand\(\)/,
  'Template Builder command should lazy-load when invoked',
);
assert.match(
  extensionSource,
  /loadDownloadSkillFolderCommand\(\)/,
  'Skill install/export command should lazy-load when invoked',
);
assert.doesNotMatch(
  extensionSource,
  /import \{ injectPreviewEnhancements \} from '\.\/webview\/previewEnhancements\.js';/,
  'Preview enhancement module should not load during extension activation',
);
assert.match(
  extensionSource,
  /loadInjectPreviewEnhancements\(\)/,
  'Preview enhancement module should lazy-load when a preview is rendered',
);
assert.match(
  extensionSource,
  /showTextDocument\(document,\s*\{\s*preview:\s*false,\s*preserveFocus:\s*false\s*\}\)/,
  'Editor-priority opening should force a text editor instead of VS Code default preview associations',
);
const constructorStart = treeProviderSource.indexOf('constructor(private readonly context');
const constructorEnd = treeProviderSource.indexOf('private resetFileWatcher', constructorStart);
const constructorBlock = treeProviderSource.slice(constructorStart, constructorEnd);
assert.doesNotMatch(
  constructorBlock,
  /void this\.refresh\(\)/,
  'File browser provider should not scan the workspace immediately on extension activation',
);
assert.doesNotMatch(
  constructorBlock,
  /this\.resetFileWatcher\(\);\s*context\.subscriptions/s,
  'File browser provider should not create its watcher before the tree is loaded',
);
assert.match(
  treeProviderSource,
  /if \(!this\.initialized\) \{\s*void this\.refresh\(\);\s*return \[this\.createLoadingItem\(\)\];/s,
  'File browser provider should lazy-load when the tree asks for root children without blocking the first paint',
);
assert.match(
  treeProviderSource,
  /this\.refreshPromise && this\.roots\.length === 0/,
  'File browser provider should keep showing a loading row while the initial refresh is still running',
);
assert.match(
  treeProviderSource,
  /this\.shouldLoadMetadata\(\) \? await this\.loadMetadata\(uris\) : new Map\(\)/,
  'Default file browser refresh should skip expensive metadata loading unless needed',
);
assert.match(
  treeProviderSource,
  /const readContent = this\.shouldReadMarkdownContentForMetadata\(\)/,
  'Markdown content should only be read for metadata modes that need line counts',
);
assert.match(
  treeProviderSource,
  /function formatVirtualFileDescription\(/,
  'Recent, pinned, and filtered duplicate filenames should show their parent path in the tree description',
);
assert.match(
  treeProviderSource,
  /item\.description = formatVirtualFileDescription\(item\.resourceUri\.fsPath, metadata, this\.sortOrder, this\.language\);/,
  'Virtual file rows should use location-aware descriptions so duplicate SKILL.md entries are distinguishable',
);
assert.doesNotMatch(
  treeProviderSource,
  /item\.description = parts\.join\(' · '\);/,
  'Folder descriptions should stay compact so tooltip detail does not look like separate tree rows',
);

console.log('vscode editor-first guard passed');
