import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTemplateBuilderPanel } from '../webview/templateBuilderPanel.js';

/**
 * Command handler for `mdStudioPreview.openTemplateBuilder`.
 *
 * Resolves the skills directory from settings, scans for SKILL.md files,
 * then opens the Drag-and-Drop Template Builder Webview panel.
 */
export async function openTemplateBuilderCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const workspaceFolder = resolveWorkspaceFolder();

  const htmlFilePath = await resolveBuilderHtmlPath(context, workspaceFolder);
  if (!htmlFilePath) {
    void vscode.window.showErrorMessage(
      'Template Builder: public/template-builder.html not found. Open the workspace root or reinstall the extension.',
    );
    return;
  }

  await createTemplateBuilderPanel(context, {
    htmlFilePath,
    onGenerate: async (markdown: string) => {
      await handleGenerate(markdown, workspaceFolder);
    },
    onInsert: async (markdown: string) => {
      await handleInsert(markdown);
    },
    onCopy: async (markdown: string) => {
      await vscode.env.clipboard.writeText(markdown);
      void vscode.window.showInformationMessage('Template Builder: Markdown copied to clipboard 📋');
    },
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveWorkspaceFolder(): vscode.WorkspaceFolder | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const matched = vscode.workspace.getWorkspaceFolder(active);
    if (matched) return matched;
  }
  return folders[0];
}

// skillsDir resolver removed

/**
 * Resolves the path to public/template-builder.html.
 * Priority:
 *   1. Workspace root / public/template-builder.html  (development mode)
 *   2. Extension install directory / public/template-builder.html (bundled)
 */
async function resolveBuilderHtmlPath(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<string | null> {
  if (workspaceFolder) {
    const workspacePath = path.join(workspaceFolder.uri.fsPath, 'public', 'template-builder.html');
    if (await fileExists(workspacePath)) return workspacePath;
  }
  const bundledPath = path.join(context.extensionPath, 'public', 'template-builder.html');
  if (await fileExists(bundledPath)) return bundledPath;
  return null;
}

async function handleGenerate(
  markdown: string,
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<void> {
  const targetDir = workspaceFolder
    ? path.join(workspaceFolder.uri.fsPath, 'templates')
    : path.join(process.cwd(), 'templates');

  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch {
    // Directory already exists — safe to ignore.
  }

  const timestamp = formatTimestamp(new Date());
  const fileName = `${timestamp}_template.md`;
  const filePath = path.join(targetDir, fileName);

  try {
    await fs.writeFile(filePath, markdown, 'utf8');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Template Builder: Failed to write file — ${msg}`);
    return;
  }

  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
  void vscode.window.showInformationMessage(`Template saved: templates/${fileName}`);
}

async function handleInsert(markdown: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Template Builder: No active text editor to insert into.');
    return;
  }
  const success = await editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, markdown);
  });
  if (!success) {
    void vscode.window.showErrorMessage('Template Builder: Insert failed.');
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
