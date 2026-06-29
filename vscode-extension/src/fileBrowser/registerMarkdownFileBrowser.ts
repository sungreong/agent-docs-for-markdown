import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  MarkdownFileBrowserProvider,
  type FileBrowserFilterMode,
  type FileBrowserHiddenItem,
  type FileBrowserSortOrder,
} from '../providers/markdownFileTreeProvider.js';
import { MarkdownFileItem } from '../providers/markdownFileItem.js';
import { registerFolderFocusCommands } from '../commands/focusFolder.js';
import { isMarkdownFileUri, isPreviewableFileUri, normalizeFileExtension } from '../utils/markdownFiles.js';
import { pickLocalized, readMdStudioLanguage, type MdStudioLanguage } from '../utils/localization.js';

interface FileBrowserSortQuickPickItem extends vscode.QuickPickItem {
  order: FileBrowserSortOrder;
}

interface FileBrowserFilterQuickPickItem extends vscode.QuickPickItem {
  mode: FileBrowserFilterMode;
}

interface HiddenQuickPickItem extends vscode.QuickPickItem {
  action: 'clear' | 'unhide';
  fsPath?: string;
}

interface ExtraExtensionQuickPickItem extends vscode.QuickPickItem {
  action?: 'add' | 'clear';
  extension?: string;
}

export interface MarkdownFileBrowserController {
  recordRecent(resourceUri: vscode.Uri): void;
  reveal(resourceUri: vscode.Uri): void;
}

interface RegisterMarkdownFileBrowserOptions {
  openInEditor(uri: vscode.Uri): Promise<void>;
  openInViewer(uri: vscode.Uri): Promise<void>;
  openInNewPanel(uri: vscode.Uri): Promise<void>;
  resolveMarkdownUri(commandArg?: unknown): Promise<vscode.Uri | null>;
  resolvePreviewUri(commandArg?: unknown): Promise<vscode.Uri | null>;
}

function getFileBrowserSortItems(language: MdStudioLanguage): readonly FileBrowserSortQuickPickItem[] {
  return [
    { label: pickLocalized(language, { en: 'Name A-Z', ko: '이름 A-Z' }), description: pickLocalized(language, { en: 'Folders/files by name', ko: '폴더/파일 이름순' }), order: 'nameAsc' },
    { label: pickLocalized(language, { en: 'Name Z-A', ko: '이름 Z-A' }), description: pickLocalized(language, { en: 'Folders/files by reverse name', ko: '폴더/파일 이름 역순' }), order: 'nameDesc' },
    { label: pickLocalized(language, { en: 'Recently modified', ko: '최근 수정' }), description: pickLocalized(language, { en: 'Newest edited documents first', ko: '방금 고친 문서 먼저' }), order: 'modifiedDesc' },
    { label: pickLocalized(language, { en: 'Least recently modified', ko: '오래 안 고침' }), description: pickLocalized(language, { en: 'Oldest edited documents first', ko: '오래된 수정 문서 먼저' }), order: 'modifiedAsc' },
    { label: pickLocalized(language, { en: 'Recently created', ko: '최근 생성' }), description: pickLocalized(language, { en: 'Newest created documents first', ko: '새로 만든 문서 먼저' }), order: 'createdDesc' },
    { label: pickLocalized(language, { en: 'Oldest created', ko: '오래된 생성' }), description: pickLocalized(language, { en: 'Oldest created documents first', ko: '오래전에 만든 문서 먼저' }), order: 'createdAsc' },
    { label: pickLocalized(language, { en: 'Largest files', ko: '큰 파일' }), description: pickLocalized(language, { en: 'Largest documents first', ko: '용량 큰 문서 먼저' }), order: 'sizeDesc' },
    { label: pickLocalized(language, { en: 'Smallest files', ko: '작은 파일' }), description: pickLocalized(language, { en: 'Smallest documents first', ko: '용량 작은 문서 먼저' }), order: 'sizeAsc' },
    { label: pickLocalized(language, { en: 'Longest documents', ko: '긴 문서' }), description: pickLocalized(language, { en: 'Most lines first', ko: '줄 수 많은 문서 먼저' }), order: 'lengthDesc' },
    { label: pickLocalized(language, { en: 'Shortest documents', ko: '짧은 문서' }), description: pickLocalized(language, { en: 'Fewest lines first', ko: '줄 수 적은 문서 먼저' }), order: 'lengthAsc' },
  ];
}

function getFileBrowserFilterItems(language: MdStudioLanguage): readonly FileBrowserFilterQuickPickItem[] {
  return [
    { label: pickLocalized(language, { en: 'All', ko: '전체' }), description: pickLocalized(language, { en: 'Full folder tree', ko: '전체 폴더 트리' }), mode: 'all' },
    { label: pickLocalized(language, { en: 'Pinned', ko: '고정' }), description: pickLocalized(language, { en: 'Pinned documents only', ko: '고정 문서만' }), mode: 'pinned' },
    { label: pickLocalized(language, { en: 'Recent', ko: '최근' }), description: pickLocalized(language, { en: 'Recently opened documents', ko: '최근 열어본 문서' }), mode: 'recent' },
    { label: pickLocalized(language, { en: 'Stale', ko: '오래 안 고침' }), description: pickLocalized(language, { en: 'Not modified for 30+ days', ko: '30일 이상 미수정' }), mode: 'stale' },
    { label: pickLocalized(language, { en: 'Long documents', ko: '긴 문서' }), description: pickLocalized(language, { en: 'Top 20 by line count', ko: '줄 수 상위 20개' }), mode: 'long' },
    { label: pickLocalized(language, { en: 'Large files', ko: '큰 파일' }), description: pickLocalized(language, { en: 'Top 20 by file size', ko: '용량 상위 20개' }), mode: 'large' },
  ];
}

const suggestedExtraExtensions = [
  '.txt',
  '.json',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.yaml',
  '.yml',
  '.csv',
  '.py',
  '.toml',
  '.xml',
];

export function registerMarkdownFileBrowser(
  context: vscode.ExtensionContext,
  options: RegisterMarkdownFileBrowserOptions,
): MarkdownFileBrowserController {
  const provider = new MarkdownFileBrowserProvider(context);
  const treeView = vscode.window.createTreeView('mdStudioFileBrowser', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);
  updateDescription(treeView, provider);
  registerFolderFocusCommands(context, provider, {
    onDidChangeFocus: () => updateDescription(treeView, provider),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.refresh', async () => {
      await provider.refresh();
      updateDescription(treeView, provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.sort', async () => {
      const language = readMdStudioLanguage();
      const currentOrder = provider.getSortOrder();
      const picked = await vscode.window.showQuickPick(
        getFileBrowserSortItems(language).map((item) => ({
          ...item,
          description: item.order === currentOrder
            ? `${pickLocalized(language, { en: 'Current', ko: '현재' })} | ${item.description ?? ''}`
            : item.description,
        })),
        { placeHolder: 'Markdown file sort...', matchOnDescription: true },
      );
      if (!picked) return;
      await provider.setSortOrder(picked.order);
      updateDescription(treeView, provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.filter', async () => {
      const language = readMdStudioLanguage();
      const currentMode = provider.getFilterMode();
      const picked = await vscode.window.showQuickPick(
        getFileBrowserFilterItems(language).map((item) => ({
          ...item,
          description: item.mode === currentMode
            ? `${pickLocalized(language, { en: 'Current', ko: '현재' })} | ${item.description ?? ''}`
            : item.description,
        })),
        { placeHolder: 'Markdown file filter...', matchOnDescription: true },
      );
      if (!picked) return;
      await provider.setFilterMode(picked.mode);
      updateDescription(treeView, provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.configureExtensions', async () => {
      await configureExtraExtensions(provider, treeView);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.pinToTop', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      await provider.pinFile(uri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.unpin', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      await provider.unpinFile(uri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.openInEditor', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await pickBrowserFile(provider));
      if (!uri) return;
      await options.openInEditor(uri);
      void provider.recordRecentFile(uri);
      revealInTree(treeView, uri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioPreview.openFileInViewer', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolvePreviewUri(commandArg));
      if (!uri) return;
      await options.openInViewer(uri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioPreview.openFileInNewPanel', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolvePreviewUri(commandArg));
      if (!uri) return;
      await options.openInNewPanel(uri);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.copyPath', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      await copyToClipboard(uri.fsPath, 'Path copied.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.copyRelativePath', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      const includeWorkspaceName = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
      await copyToClipboard(vscode.workspace.asRelativePath(uri, includeWorkspaceName), 'Relative path copied.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.copyFileName', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      await copyToClipboard(path.basename(uri.fsPath), 'Name copied.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.hideItem', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? (await options.resolveMarkdownUri(commandArg));
      if (!uri) return;
      await provider.hideItem(uri);
      updateDescription(treeView, provider);
      const language = readMdStudioLanguage();
      void vscode.window.showInformationMessage(
        pickLocalized(language, { en: `Hidden from browser: ${formatRelativePath(uri)}`, ko: `숨김 처리했습니다: ${formatRelativePath(uri)}` }),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.delete', async (commandArg?: unknown) => {
      const uri = getResourceUri(commandArg) ?? treeView.selection[0]?.resourceUri ?? null;
      if (!uri) {
        const language = readMdStudioLanguage();
        void vscode.window.showWarningMessage(
          pickLocalized(language, { en: 'Select a file or folder in MD Studio File Browser first.', ko: '먼저 MD Studio File Browser에서 파일이나 폴더를 선택하세요.' }),
        );
        return;
      }
      await deleteBrowserItem(uri, provider, treeView);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.manageHidden', async () => {
      await manageHiddenItems(provider, treeView);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdStudioFileBrowser.search', async () => {
      const picked = await pickBrowserFile(provider);
      if (!picked) return;
      if (isPreviewableFileUri(picked)) {
        await options.openInViewer(picked);
      } else {
        await options.openInEditor(picked);
      }
      void provider.recordRecentFile(picked);
      revealInTree(treeView, picked);
    }),
  );

  return {
    recordRecent(resourceUri) {
      void provider.recordRecentFile(resourceUri);
    },
    reveal(resourceUri) {
      revealInTree(treeView, resourceUri);
    },
  };
}

async function deleteBrowserItem(
  uri: vscode.Uri,
  provider: MarkdownFileBrowserProvider,
  treeView: vscode.TreeView<MarkdownFileItem>,
): Promise<void> {
  const language = readMdStudioLanguage();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage(
      pickLocalized(language, { en: 'Only workspace files and folders can be deleted from MD Studio File Browser.', ko: 'MD Studio File Browser에서는 워크스페이스 안의 파일과 폴더만 삭제할 수 있습니다.' }),
    );
    return;
  }
  if (sameFsPath(uri.fsPath, workspaceFolder.uri.fsPath)) {
    void vscode.window.showErrorMessage(
      pickLocalized(language, { en: 'The workspace root cannot be deleted from MD Studio File Browser.', ko: 'MD Studio File Browser에서는 워크스페이스 루트를 삭제할 수 없습니다.' }),
    );
    return;
  }

  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(uri);
  } catch {
    await provider.refresh();
    updateDescription(treeView, provider);
    void vscode.window.showWarningMessage(
      pickLocalized(language, { en: `Already missing: ${formatRelativePath(uri)}`, ko: `이미 없습니다: ${formatRelativePath(uri)}` }),
    );
    return;
  }

  const isDirectory = Boolean(stat.type & vscode.FileType.Directory);
  const deleteLabel = pickLocalized(language, { en: 'Move to Trash', ko: '휴지통으로 이동' });
  const confirmed = await vscode.window.showWarningMessage(
    pickLocalized(language, {
      en: `Move ${isDirectory ? 'folder' : 'file'} to Trash?\n\n${formatRelativePath(uri)}`,
      ko: `${isDirectory ? '폴더' : '파일'}를 휴지통으로 이동할까요?\n\n${formatRelativePath(uri)}`,
    }),
    { modal: true },
    deleteLabel,
  );
  if (confirmed !== deleteLabel) return;

  await vscode.workspace.fs.delete(uri, { recursive: isDirectory, useTrash: true });
  await provider.refresh();
  updateDescription(treeView, provider);
  void vscode.window.showInformationMessage(
    pickLocalized(language, { en: `Moved to Trash: ${formatRelativePath(uri)}`, ko: `휴지통으로 이동했습니다: ${formatRelativePath(uri)}` }),
  );
}

function updateDescription(
  treeView: vscode.TreeView<MarkdownFileItem>,
  provider: MarkdownFileBrowserProvider,
): void {
  treeView.description = provider.getSortDescription();
}

async function manageHiddenItems(
  provider: MarkdownFileBrowserProvider,
  treeView: vscode.TreeView<MarkdownFileItem>,
): Promise<void> {
  const hiddenItems = provider.getHiddenItems();
  const language = readMdStudioLanguage();
  if (!hiddenItems.length) {
    void vscode.window.showInformationMessage(pickLocalized(language, { en: 'No hidden files or folders.', ko: '숨긴 파일이나 폴더가 없습니다.' }));
    return;
  }

  const picked = await vscode.window.showQuickPick(buildHiddenQuickPickItems(hiddenItems, language), {
    placeHolder: pickLocalized(language, { en: 'Manage hidden files/folders...', ko: '숨긴 파일/폴더 관리...' }),
    matchOnDescription: true,
  });
  if (!picked) return;

  if (picked.action === 'clear') {
    const clearLabel = pickLocalized(language, { en: 'Clear', ko: '해제' });
    const confirmed = await vscode.window.showWarningMessage(
      pickLocalized(language, { en: 'Clear all hidden items?', ko: '숨김 목록을 모두 해제할까요?' }),
      { modal: true },
      clearLabel,
    );
    if (confirmed !== clearLabel) return;
    await provider.clearHiddenItems();
    updateDescription(treeView, provider);
    void vscode.window.showInformationMessage(pickLocalized(language, { en: 'Cleared all hidden items.', ko: '숨김 목록을 모두 해제했습니다.' }));
    return;
  }

  if (!picked.fsPath) return;
  await provider.unhideItem(picked.fsPath);
  updateDescription(treeView, provider);
  void vscode.window.showInformationMessage(
    pickLocalized(language, { en: `Shown again: ${formatRelativePath(vscode.Uri.file(picked.fsPath))}`, ko: `다시 표시합니다: ${formatRelativePath(vscode.Uri.file(picked.fsPath))}` }),
  );
}

function buildHiddenQuickPickItems(hiddenItems: FileBrowserHiddenItem[], language: MdStudioLanguage): HiddenQuickPickItem[] {
  return [
    {
      label: pickLocalized(language, { en: '$(clear-all) Clear all hidden items', ko: '$(clear-all) 숨김 모두 해제' }),
      description: pickLocalized(language, { en: `${hiddenItems.length.toLocaleString()} items`, ko: `${hiddenItems.length.toLocaleString()}개` }),
      action: 'clear',
      alwaysShow: true,
    },
    ...hiddenItems.map((item) => ({
      label: item.label,
      description: item.description,
      detail: item.fsPath,
      action: 'unhide' as const,
      fsPath: item.fsPath,
    })),
  ];
}

async function configureExtraExtensions(
  provider: MarkdownFileBrowserProvider,
  treeView: vscode.TreeView<MarkdownFileItem>,
): Promise<void> {
  const current = provider.getExtraExtensions();
  const language = readMdStudioLanguage();
  const candidateExtensions = [...current, ...suggestedExtraExtensions].filter(
    (extension, index, all) => all.indexOf(extension) === index,
  );
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: pickLocalized(language, { en: '$(add) Add manually...', ko: '$(add) 직접 추가...' }),
        description: pickLocalized(language, { en: 'Example: txt, html, json', ko: '예: txt, html, json' }),
        action: 'add' as const,
        alwaysShow: true,
      },
      {
        label: pickLocalized(language, { en: '$(clear-all) Clear all extra extensions', ko: '$(clear-all) 추가 확장자 모두 해제' }),
        description: current.length ? current.join(', ') : pickLocalized(language, { en: 'No extra extensions configured', ko: '설정된 추가 확장자가 없습니다' }),
        action: 'clear' as const,
        alwaysShow: true,
      },
      ...candidateExtensions.map((extension) => ({
        label: extension,
        description: current.includes(extension)
          ? pickLocalized(language, { en: 'Currently visible', ko: '현재 표시 중' })
          : pickLocalized(language, { en: 'Click to show', ko: '클릭해서 표시' }),
        picked: current.includes(extension),
        extension,
      })),
    ] satisfies ExtraExtensionQuickPickItem[],
    {
      canPickMany: true,
      matchOnDescription: true,
      placeHolder: pickLocalized(language, {
        en: 'Choose extra extensions to show in MD Studio File Browser. Markdown is always visible.',
        ko: 'MD Studio File Browser에 추가로 보여줄 확장자를 선택하세요. Markdown은 항상 표시됩니다.',
      }),
    },
  );
  if (!picked) return;

  const selected = picked as ExtraExtensionQuickPickItem[];
  let nextExtensions = selected
    .map((item) => item.extension)
    .filter((extension): extension is string => Boolean(extension));

  if (selected.some((item) => item.action === 'clear')) {
    nextExtensions = [];
  }

  if (selected.some((item) => item.action === 'add')) {
    const input = await vscode.window.showInputBox({
      title: pickLocalized(language, { en: 'Add extra extension', ko: '추가 확장자 입력' }),
      prompt: pickLocalized(language, { en: 'A leading dot is optional. Example: txt, html, json', ko: '점은 있어도 없어도 됩니다. 예: txt, html, json' }),
      placeHolder: 'txt',
      validateInput(value) {
        return normalizeFileExtension(value)
          ? null
          : pickLocalized(language, { en: 'Use only letters, numbers, hyphens, or underscores.', ko: '영문/숫자/하이픈/언더스코어 확장자만 사용할 수 있습니다.' });
      },
    });
    const customExtension = normalizeFileExtension(input);
    if (customExtension && !nextExtensions.includes(customExtension)) {
      nextExtensions.push(customExtension);
    }
  }

  await provider.setExtraExtensions(nextExtensions);
  updateDescription(treeView, provider);
  const enabled = provider.getExtraExtensions();
  void vscode.window.showInformationMessage(
    enabled.length
      ? pickLocalized(language, { en: `Showing extra extensions: ${enabled.join(', ')}`, ko: `추가 확장자를 표시합니다: ${enabled.join(', ')}` })
      : pickLocalized(language, { en: 'Cleared extra extensions. Markdown files remain visible.', ko: '추가 확장자 표시를 해제했습니다. Markdown 파일은 계속 표시됩니다.' }),
  );
}

async function pickBrowserFile(provider: MarkdownFileBrowserProvider): Promise<vscode.Uri | null> {
  const uris = await provider.findVisibleFiles();
  const folders = vscode.workspace.workspaceFolders;
  const items = uris
    .map((uri) => {
      const rel = folders?.length ? vscode.workspace.asRelativePath(uri, folders.length > 1) : uri.fsPath;
      return {
        label: path.basename(uri.fsPath),
        description: path.dirname(rel),
        detail: isPreviewableFileUri(uri) ? 'Open in Viewer' : 'Open in Editor',
        uri,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Search MD Studio files (${provider.getExtensionDescription()})...`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.uri ?? null;
}

function revealInTree(treeView: vscode.TreeView<MarkdownFileItem>, uri: vscode.Uri): void {
  try {
    void treeView.reveal(new MarkdownFileItem(uri, false), { select: true, focus: false });
  } catch {
    // File may be outside the current tree view.
  }
}

async function copyToClipboard(value: string, message: string): Promise<void> {
  await vscode.env.clipboard.writeText(value);
  void vscode.window.showInformationMessage(message);
}

function getResourceUri(commandArg: unknown): vscode.Uri | null {
  if (commandArg instanceof vscode.Uri) return commandArg;
  if (!commandArg || typeof commandArg !== 'object') return null;
  const resourceUri = (commandArg as { resourceUri?: unknown }).resourceUri;
  return resourceUri instanceof vscode.Uri ? resourceUri : null;
}

function sameFsPath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function formatRelativePath(uri: vscode.Uri): string {
  const includeWorkspaceName = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
  return vscode.workspace.asRelativePath(uri, includeWorkspaceName);
}
