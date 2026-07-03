import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const menus = packageJson.contributes?.menus ?? {};

const explorerCommands = (menus['explorer/context'] ?? []).map((item) => item.command);
assert(
  !explorerCommands.includes('markdownAgentDocs.focusFolder'),
  'Focus This Folder must not appear in the VS Code Explorer context menu',
);
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
assert(browserFocusItem, 'Focus This Folder should remain available in the Agent Docs File Browser context menu');
assert(browserClearFocusItem, 'Clear Folder Focus should be available in the Agent Docs File Browser context menu');
const contributedCommands = packageJson.contributes?.commands ?? [];
assert(
  contributedCommands.some((item) => item.command === 'markdownAgentDocs.focusFolder' && item.title === 'Focus This Folder'),
  'Folder focus command title should describe the action plainly',
);
assert(
  contributedCommands.some((item) => item.command === 'markdownAgentDocs.clearFolderFocus' && item.title === 'Clear Folder Focus'),
  'Clear folder focus command title should describe the action plainly',
);
assert.match(
  browserFocusItem.when ?? '',
  /view == markdownAgentDocsFileBrowser/,
  'Focus This Folder should be scoped to the Agent Docs File Browser view',
);
assert.match(browserFocusItem.when ?? '', /viewItem == mdFolder/, 'Focus This Folder should only appear on browser folders');
assert.match(
  browserClearFocusItem.when ?? '',
  /view == markdownAgentDocsFileBrowser/,
  'Clear Folder Focus should be scoped to the Agent Docs File Browser view',
);
assert.match(
  browserClearFocusItem.when ?? '',
  /markdownAgentDocs\.folderFocusActive/,
  'Clear Folder Focus should only appear while folder focus is active',
);
assert.match(browserClearFocusItem.when ?? '', /viewItem == mdFolder/, 'Clear Folder Focus should only appear on browser folders');

console.log('vscode focus menu guard passed');
