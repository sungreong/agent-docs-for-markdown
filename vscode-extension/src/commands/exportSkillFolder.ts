import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

const yazl = require('yazl') as {
  ZipFile: new () => {
    outputStream: NodeJS.ReadableStream;
    addFile(realPath: string, metadataPath: string): void;
    end(): void;
    on(event: 'error', listener: (error: Error) => void): void;
  };
};

interface SkillSource {
  id: string;
  label: string;
  description: string;
  rootDir: string;
}

interface ExportableSkill {
  id: string;
  name: string;
  description: string;
  dir: string;
  source: SkillSource;
}

interface SourcePick extends vscode.QuickPickItem {
  source: SkillSource;
}

interface SkillPick extends vscode.QuickPickItem {
  skill: ExportableSkill;
}

interface ActionPick extends vscode.QuickPickItem {
  action: 'zip-one' | 'update-one' | 'update-all';
}

interface SkillTarget {
  id: string;
  label: string;
  description: string;
  rootDir: string;
}

interface SkillTargetPlan {
  primaryTarget: SkillTarget | null;
}

interface TargetActionPick extends vscode.QuickPickItem {
  action: 'primary' | 'choose-folder';
}

const bundledProfiles = [
  { id: 'claude', label: 'Bundled Claude' },
  { id: 'agents', label: 'Bundled Agents' },
  { id: 'codex', label: 'Bundled Codex' },
] as const;

const excludedNames = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

export async function downloadSkillFolderCommand(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = resolveWorkspaceFolder();
  const sources = await resolveSkillSources(context, workspaceFolder);

  if (sources.length === 0) {
    void vscode.window.showErrorMessage('MD Studio: No bundled or workspace skill folders were found.');
    return;
  }

  const source = await pickSkillSource(sources);
  if (!source) return;

  const skills = await scanExportableSkills(source);
  if (skills.length === 0) {
    void vscode.window.showErrorMessage(`MD Studio: No skill folders with SKILL.md found in ${source.rootDir}.`);
    return;
  }

  const targetPlan = await resolveSkillUpdateTargets(context, workspaceFolder, source);
  const action = await pickSkillAction(source, targetPlan.primaryTarget);
  if (!action) return;

  if (action === 'update-all') {
    const selectedTargets = await pickUpdateTargets(source, targetPlan.primaryTarget);
    if (!selectedTargets || selectedTargets.length === 0) return;
    await updateSkillFolders(skills, selectedTargets);
    return;
  }

  const skill = await pickSkill(skills, action === 'zip-one' ? 'Choose a skill folder to download' : 'Choose a skill folder to update');
  if (!skill) return;

  if (action === 'update-one') {
    const selectedTargets = await pickUpdateTargets(source, targetPlan.primaryTarget);
    if (!selectedTargets || selectedTargets.length === 0) return;
    await updateSkillFolders([skill], selectedTargets);
    return;
  }

  await downloadSkillAsZip(skill, workspaceFolder);
}

async function downloadSkillAsZip(
  skill: ExportableSkill,
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<void> {
  const defaultDir = workspaceFolder?.uri.fsPath || os.homedir();
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(defaultDir, `${safeFileName(skill.id)}.zip`)),
    filters: {
      'ZIP Archives': ['zip'],
    },
    saveLabel: 'Download Skill Folder',
    title: `Download ${skill.id} as ZIP`,
  });
  if (!saveUri) return;

  if (isSameOrInside(saveUri.fsPath, skill.dir)) {
    void vscode.window.showErrorMessage('MD Studio: Save the ZIP outside the skill folder to avoid archiving itself.');
    return;
  }

  try {
    await fs.mkdir(path.dirname(saveUri.fsPath), { recursive: true });
    await zipSkillFolder(skill.dir, saveUri.fsPath, safeFileName(skill.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MD Studio: Failed to download skill folder - ${message}`);
    return;
  }

  const revealAction = 'Reveal in Explorer';
  const action = await vscode.window.showInformationMessage(
    `MD Studio: Skill folder downloaded to ${saveUri.fsPath}`,
    revealAction,
  );
  if (action === revealAction) {
    await vscode.commands.executeCommand('revealFileInOS', saveUri);
  }
}

async function resolveSkillSources(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<SkillSource[]> {
  const sources: SkillSource[] = [];

  for (const profile of bundledProfiles) {
    const rootDir = await firstExistingDirectory([
      path.join(context.extensionPath, 'ai_skills', profile.id, 'skills'),
      path.resolve(context.extensionPath, '..', 'ai_skills', profile.id, 'skills'),
    ]);
    if (rootDir) {
      sources.push({
        id: `bundled-${profile.id}`,
        label: profile.label,
        description: rootDir,
        rootDir,
      });
    }
  }

  const workspaceSkillsDir = resolveWorkspaceSkillsDir(workspaceFolder);
  if (workspaceSkillsDir) {
    sources.push({
      id: 'workspace',
      label: 'Workspace configured skillsDir',
      description: workspaceSkillsDir,
      rootDir: workspaceSkillsDir,
    });
  }

  return sources;
}

async function firstExistingDirectory(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return path.normalize(candidate);
  }
  return null;
}

async function pickSkillSource(sources: SkillSource[]): Promise<SkillSource | null> {
  const picked = await vscode.window.showQuickPick<SourcePick>(
    sources.map((source) => ({
      label: source.label,
      description: source.id,
      detail: source.description,
      source,
    })),
    {
      ignoreFocusOut: true,
      placeHolder: 'Choose the skill source to download from',
    },
  );
  return picked?.source ?? null;
}

async function pickSkillAction(source: SkillSource, primaryTarget: SkillTarget | null): Promise<ActionPick['action'] | null> {
  const hasTarget = Boolean(primaryTarget);
  const targetLabel = primaryTarget?.label || targetLabelForSource(source);
  const items: ActionPick[] = [
    {
      label: 'Download selected skill as ZIP',
      description: 'Save a portable ZIP',
      detail: 'Use this when you want to send one skill folder to another agent manually.',
      action: 'zip-one',
    },
  ];

  if (hasTarget) {
    items.push(
      {
        label: `Update selected skill in ${targetLabel}`,
        description: primaryTarget?.rootDir,
        detail: 'Replace the matching skill folder only in the workspace target that matches the chosen source.',
        action: 'update-one',
      },
      {
        label: `Update all ${source.label.replace(/^Bundled\s+/, '')} skills`,
        description: primaryTarget?.rootDir,
        detail: 'Replace every skill from the chosen source only in its matching workspace target.',
        action: 'update-all',
      },
    );
  }

  const picked = await vscode.window.showQuickPick<ActionPick>(items, {
    ignoreFocusOut: true,
    placeHolder: hasTarget
      ? `Download a ZIP, or update ${targetLabel}?`
      : `No matching ${targetLabel} folder detected. Download as ZIP?`,
  });

  return picked?.action ?? null;
}

async function scanExportableSkills(source: SkillSource): Promise<ExportableSkill[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(source.rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: ExportableSkill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

    const skillDir = path.join(source.rootDir, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!(await fileExists(skillMdPath))) continue;

    let content = '';
    try {
      content = await fs.readFile(skillMdPath, 'utf8');
    } catch {
      // A skill without a readable SKILL.md is not exportable.
      continue;
    }

    const meta = parseSkillMeta(entry.name, content);
    skills.push({
      id: entry.name,
      name: meta.name,
      description: meta.description,
      dir: skillDir,
      source,
    });
  }

  return skills;
}

async function pickSkill(skills: ExportableSkill[], placeHolder = 'Choose a skill folder to download'): Promise<ExportableSkill | null> {
  const picked = await vscode.window.showQuickPick<SkillPick>(
    skills.map((skill) => ({
      label: skill.name || skill.id,
      description: skill.id,
      detail: `${skill.source.label} - ${skill.description || skill.dir}`,
      skill,
    })),
    {
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder,
    },
  );
  return picked?.skill ?? null;
}

async function resolveSkillUpdateTargets(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder | null,
  source: SkillSource,
): Promise<SkillTargetPlan> {
  const candidates: SkillTarget[] = [];
  const workspaceRoot = workspaceFolder?.uri.fsPath || '';
  const addCandidate = (id: string, label: string, rootDir: string | null) => {
    if (!rootDir) return;
    candidates.push({
      id,
      label,
      description: rootDir,
      rootDir: path.normalize(rootDir),
    });
  };

  if (workspaceRoot) {
    addCandidate('workspace-claude', 'Workspace .claude/skills', path.join(workspaceRoot, '.claude', 'skills'));
    addCandidate('workspace-agents', 'Workspace .agents/skills', path.join(workspaceRoot, '.agents', 'skills'));
    addCandidate('workspace-codex', 'Workspace .codex/skills', path.join(workspaceRoot, '.codex', 'skills'));
    addCandidate('workspace-configured', 'Workspace configured skillsDir', resolveWorkspaceSkillsDir(workspaceFolder));
  }

  const extensionSkillsRoot = path.join(context.extensionPath, 'ai_skills');
  const deduped = new Map<string, SkillTarget>();
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate.rootDir);
    const key = normalizeForCompare(normalized);
    if (deduped.has(key)) continue;
    if (normalizeForCompare(normalized) === normalizeForCompare(source.rootDir)) continue;
    if (isSameOrInside(normalized, extensionSkillsRoot)) continue;
    if (!(await directoryExists(normalized))) continue;
    deduped.set(key, {
      ...candidate,
      rootDir: normalized,
    });
  }

  const targets = [...deduped.values()];
  const primaryId = targetIdForSource(source);
  const primaryTarget = targets.find((target) => target.id === primaryId) ?? null;

  return { primaryTarget };
}

async function pickUpdateTargets(source: SkillSource, primaryTarget: SkillTarget | null): Promise<SkillTarget[] | null> {
  const targetLabel = targetLabelForSource(source);
  if (!primaryTarget) {
    void vscode.window.showErrorMessage(`MD Studio: No matching ${targetLabel} folder was detected in this workspace.`);
    return null;
  }

  const choices: TargetActionPick[] = [
    {
      label: `Update ${primaryTarget.label}`,
      description: primaryTarget.rootDir,
      detail: 'Recommended: update the workspace skill folder that matches the source you selected.',
      action: 'primary',
    },
    {
      label: 'Choose another folder...',
      description: 'Select a workspace skills root',
      detail: 'Advanced: pick a different workspace folder that contains skill folders.',
      action: 'choose-folder',
    },
  ];

  const pickedAction = await vscode.window.showQuickPick<TargetActionPick>(choices, {
    ignoreFocusOut: true,
    placeHolder: `Update ${source.label} into ${targetLabel}?`,
  });
  if (!pickedAction) return null;

  if (pickedAction.action === 'primary') return [primaryTarget];

  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Use as Skill Folder',
    title: 'Choose workspace skill root folder(s)',
  });
  if (!selected || selected.length === 0) return null;
  const outsideWorkspace = selected.find((uri) => !isInsideAnyWorkspace(uri.fsPath));
  if (outsideWorkspace) {
    void vscode.window.showErrorMessage(`MD Studio: Skill updates are workspace-only. ${outsideWorkspace.fsPath} is outside the current workspace.`);
    return null;
  }
  return selected.map((uri, index) => ({
    id: `chosen-${index}`,
    label: path.basename(uri.fsPath) || uri.fsPath,
    description: uri.fsPath,
    rootDir: path.normalize(uri.fsPath),
  }));
}

function targetIdForSource(source: SkillSource): string {
  if (source.id === 'bundled-claude') return 'workspace-claude';
  if (source.id === 'bundled-agents') return 'workspace-agents';
  if (source.id === 'bundled-codex') return 'workspace-codex';
  return 'workspace-configured';
}

function targetLabelForSource(source: SkillSource): string {
  if (source.id === 'bundled-claude') return 'Workspace .claude/skills';
  if (source.id === 'bundled-agents') return 'Workspace .agents/skills';
  if (source.id === 'bundled-codex') return 'Workspace .codex/skills';
  return 'Workspace configured skillsDir';
}

async function updateSkillFolders(skills: ExportableSkill[], targets: SkillTarget[]): Promise<void> {
  const totalOperations = skills.length * targets.length;
  if (totalOperations === 0) return;

  const targetSummary = targets.map((target) => target.rootDir).join('\n');
  const confirm = await vscode.window.showWarningMessage(
    `MD Studio will replace ${skills.length} skill folder${skills.length === 1 ? '' : 's'} in ${targets.length} workspace skill root${targets.length === 1 ? '' : 's'}.\n\n${targetSummary}`,
    { modal: true },
    'Update',
  );
  if (confirm !== 'Update') return;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `MD Studio: Updating ${skills.length} skill folder${skills.length === 1 ? '' : 's'}`,
        cancellable: false,
      },
      async (progress) => {
        let done = 0;
        for (const target of targets) {
          await fs.mkdir(target.rootDir, { recursive: true });
          for (const skill of skills) {
            progress.report({
              message: `${skill.id} -> ${target.label}`,
              increment: totalOperations > 0 ? 100 / totalOperations : undefined,
            });
            await replaceSkillFolder(skill, target);
            done += 1;
          }
        }
        progress.report({ message: `${done} update${done === 1 ? '' : 's'} complete` });
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`MD Studio: Failed to update skill folder(s) - ${message}`);
    return;
  }

  const rootText = targets.length === 1 ? targets[0].rootDir : `${targets.length} workspace skill roots`;
  void vscode.window.showInformationMessage(
    `MD Studio: Updated ${skills.length} skill folder${skills.length === 1 ? '' : 's'} in ${rootText}.`,
  );
}

async function replaceSkillFolder(skill: ExportableSkill, target: SkillTarget): Promise<void> {
  const targetRoot = path.resolve(target.rootDir);
  const targetDir = path.join(targetRoot, skill.id);
  assertInsideDirectory(targetRoot, targetDir);

  if (isSameOrInside(targetDir, skill.dir) || isSameOrInside(skill.dir, targetDir)) {
    throw new Error(`Refusing to update ${skill.id}: source and target overlap.`);
  }

  await fs.mkdir(targetDir, { recursive: true });
  await clearDirectoryContents(targetDir);
  await fs.cp(skill.dir, targetDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !excludedNames.has(path.basename(sourcePath)),
  });
}

async function clearDirectoryContents(targetDir: string): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (excludedNames.has(entry.name) || entry.isSymbolicLink()) continue;
    await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function zipSkillFolder(sourceDir: string, outputPath: string, zipRootName: string): Promise<void> {
  const zipFile = new yazl.ZipFile();
  const zipError = new Promise<never>((_resolve, reject) => {
    zipFile.on('error', reject);
  });
  const streamDone = pipeline(zipFile.outputStream, createWriteStream(outputPath));

  await addDirectoryToZip(zipFile, sourceDir, '', zipRootName);
  zipFile.end();

  await Promise.race([streamDone, zipError]);
}

async function addDirectoryToZip(
  zipFile: InstanceType<typeof yazl.ZipFile>,
  currentDir: string,
  relativeDir: string,
  zipRootName: string,
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (excludedNames.has(entry.name) || entry.isSymbolicLink()) continue;

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryToZip(zipFile, absolutePath, relativePath, zipRootName);
      continue;
    }

    if (!entry.isFile()) continue;
    zipFile.addFile(absolutePath, toZipPath(zipRootName, relativePath));
  }
}

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

function resolveWorkspaceSkillsDir(workspaceFolder: vscode.WorkspaceFolder | null): string | null {
  const raw = String(
    vscode.workspace.getConfiguration('mdStudioPreview').get<string>('skillsDir', 'claude_skills/skills') || '',
  ).trim();
  const value = raw || 'claude_skills/skills';
  const workspaceRoot = workspaceFolder?.uri.fsPath || '';
  const expanded = workspaceRoot ? value.replace(/\$\{workspaceFolder\}/g, workspaceRoot) : value;

  if (path.isAbsolute(expanded)) return path.normalize(expanded);
  if (!workspaceRoot) return null;
  return path.join(workspaceRoot, expanded);
}

function parseSkillMeta(id: string, content: string): { name: string; description: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return { name: id, description: '' };

  const yamlBlock = frontmatterMatch[1];
  const nameMatch = yamlBlock.match(/^name:\s*(.+)$/m);
  const descMatch = yamlBlock.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch ? stripQuotes(nameMatch[1].trim()) : id,
    description: descMatch ? stripQuotes(descMatch[1].trim()) : '',
  };
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

function toZipPath(...segments: string[]): string {
  return segments
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'skill';
}

function isSameOrInside(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidate = normalizeForCompare(candidatePath);
  const normalizedParent = normalizeForCompare(parentPath);
  const relative = path.relative(normalizedParent, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertInsideDirectory(parentPath: string, candidatePath: string): void {
  if (!isSameOrInside(candidatePath, parentPath)) {
    throw new Error(`Refusing to write outside target skill root: ${candidatePath}`);
  }
}

function isInsideAnyWorkspace(candidatePath: string): boolean {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.some((folder) => isSameOrInside(candidatePath, folder.uri.fsPath));
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}
