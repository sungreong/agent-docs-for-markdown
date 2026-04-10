import * as vscode from 'vscode';
import * as path from 'node:path';

export class MarkdownFileItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly isDirectory: boolean,
    label?: string,
  ) {
    super(
      resourceUri,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    if (label) this.label = label;
    this.contextValue = isDirectory ? 'mdFolder' : 'mdFile';
    if (!isDirectory) {
      this.command = {
        command: 'mdStudioPreview.openFileInViewer',
        title: 'Open in Viewer',
        arguments: [resourceUri],
      };
      this.tooltip = resourceUri.fsPath;
    }
  }
}

export class MarkdownFileBrowserProvider implements vscode.TreeDataProvider<MarkdownFileItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    MarkdownFileItem | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tree = new Map<string, MarkdownFileItem[]>(); // folderFsPath -> children
  private itemByPath = new Map<string, MarkdownFileItem>(); // fsPath -> item (needed for getParent)
  private roots: MarkdownFileItem[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    this.watcher.onDidCreate(() => this.scheduleRefresh());
    this.watcher.onDidDelete(() => this.scheduleRefresh());
    context.subscriptions.push(this.watcher);
    void this.refresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 300);
  }

  getTreeItem(element: MarkdownFileItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MarkdownFileItem): vscode.ProviderResult<MarkdownFileItem[]> {
    if (!element) return this.roots;
    if (!element.isDirectory) return [];
    return this.tree.get(element.resourceUri.fsPath) ?? [];
  }

  // Required for treeView.reveal() to work
  getParent(element: MarkdownFileItem): MarkdownFileItem | null {
    if (this.roots.some((r) => r.resourceUri.fsPath === element.resourceUri.fsPath)) return null;
    const parentPath = path.dirname(element.resourceUri.fsPath);
    return this.itemByPath.get(parentPath) ?? null;
  }

  async refresh(): Promise<void> {
    this.tree.clear();
    this.itemByPath.clear();
    this.roots = [];

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      this._onDidChangeTreeData.fire(null);
      return;
    }

    const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/.next/**}';
    const uris = await vscode.workspace.findFiles('**/*.md', exclude);

    // Build file items keyed by their parent folder
    const folderFileMap = new Map<string, MarkdownFileItem[]>();
    for (const uri of uris) {
      const dir = path.dirname(uri.fsPath);
      if (!folderFileMap.has(dir)) folderFileMap.set(dir, []);
      const item = new MarkdownFileItem(uri, false);
      folderFileMap.get(dir)!.push(item);
      this.itemByPath.set(uri.fsPath, item);
    }

    for (const workspaceFolder of folders) {
      const rootFsPath = workspaceFolder.uri.fsPath;

      // Collect all directories that contain .md files under this workspace root
      const leafDirs = [...folderFileMap.keys()].filter((d) => d.startsWith(rootFsPath));

      // Expand to all ancestor directories up to workspace root
      const allDirs = new Set<string>(leafDirs);
      for (const dir of leafDirs) {
        let cur = path.dirname(dir);
        while (cur.startsWith(rootFsPath)) {
          allDirs.add(cur);
          if (cur === rootFsPath) break;
          cur = path.dirname(cur);
        }
      }

      // Create folder items and register in itemByPath
      for (const dir of allDirs) {
        if (dir === rootFsPath) continue;
        if (!this.itemByPath.has(dir)) {
          const item = new MarkdownFileItem(vscode.Uri.file(dir), true, path.basename(dir));
          this.itemByPath.set(dir, item);
        }
      }

      // Build parent -> children mapping
      const childrenOf = new Map<string, MarkdownFileItem[]>();
      for (const dir of allDirs) {
        const parent = dir === rootFsPath ? rootFsPath : path.dirname(dir);
        if (!childrenOf.has(parent)) childrenOf.set(parent, []);
        if (dir !== rootFsPath) {
          const item = this.itemByPath.get(dir)!;
          const siblings = childrenOf.get(parent)!;
          if (!siblings.some((s) => s.resourceUri.fsPath === dir)) {
            siblings.push(item);
          }
        }
      }

      // Attach file items to their parent folder
      for (const [folder, files] of folderFileMap) {
        if (!folder.startsWith(rootFsPath)) continue;
        if (!childrenOf.has(folder)) childrenOf.set(folder, []);
        childrenOf.get(folder)!.push(...files);
      }

      // Sort and store each folder's children
      for (const [folder, children] of childrenOf) {
        if (folder === rootFsPath) continue;
        this.tree.set(folder, sortChildren(children));
      }

      const rootChildren = childrenOf.get(rootFsPath) ?? [];
      if (folders.length > 1) {
        // Multi-root: wrap each workspace folder as a top-level expanded node
        const wsItem = new MarkdownFileItem(workspaceFolder.uri, true, workspaceFolder.name);
        wsItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        this.tree.set(rootFsPath, sortChildren(rootChildren));
        this.itemByPath.set(rootFsPath, wsItem);
        this.roots.push(wsItem);
      } else {
        // Single-root: show root-level items directly
        this.roots.push(...sortChildren(rootChildren));
      }
    }

    this._onDidChangeTreeData.fire(null);
  }
}

function sortChildren(items: MarkdownFileItem[]): MarkdownFileItem[] {
  return [...items].sort((a, b) => {
    // Folders before files
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const aName = a.label?.toString() ?? path.basename(a.resourceUri.fsPath);
    const bName = b.label?.toString() ?? path.basename(b.resourceUri.fsPath);
    return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
  });
}
