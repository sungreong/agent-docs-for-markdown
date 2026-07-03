import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const menus = packageJson.contributes?.menus ?? {};

const explorerCommands = (menus['explorer/context'] ?? []).map((item) => item.command);
assert(!explorerCommands.includes('markdownAgentDocs.focusFolder'), 'FOCUS must not appear in the VS Code Explorer context menu');
assert(
  !explorerCommands.includes('markdownAgentDocs.clearFolderFocus'),
  'Clear Folder Focus must not appear in the VS Code Explorer context menu',
);

const browserFocusItem = (menus['view/item/context'] ?? []).find(
  (item) => item.command === 'markdownAgentDocs.focusFolder',
);
const browserClearFocusItem = (menus['view/item/context'] ?? []).find(
  (item) => item.command === 'markdownAgentDocs.clearFolderFocus',
);
assert(browserFocusItem, 'FOCUS should remain available in the Agent Docs File Browser context menu');
assert(browserClearFocusItem, 'Clear FOCUS should be available in the Agent Docs File Browser context menu');
assert.match(
  browserFocusItem.when ?? '',
  /view == markdownAgentDocsFileBrowser/,
  'FOCUS should be scoped to the Agent Docs File Browser view',
);
assert.match(browserFocusItem.when ?? '', /viewItem == mdFolder/, 'FOCUS should only appear on browser folders');
assert.match(
  browserClearFocusItem.when ?? '',
  /view == markdownAgentDocsFileBrowser/,
  'Clear FOCUS should be scoped to the Agent Docs File Browser view',
);
assert.match(
  browserClearFocusItem.when ?? '',
  /markdownAgentDocs\.folderFocusActive/,
  'Clear FOCUS should only appear while folder focus is active',
);
assert.match(browserClearFocusItem.when ?? '', /viewItem == mdFolder/, 'Clear FOCUS should only appear on browser folders');

console.log('vscode focus menu guard passed');
