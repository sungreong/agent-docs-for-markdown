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
  action: 'zip-one' | 'update-one' | 'update-one-all-agents' | 'update-all' | 'update-all-agents';
}

interface WorkflowPick extends vscode.QuickPickItem {
  action: 'install-bundled-matching' | 'export-zip' | 'advanced';
}

interface SkillTarget {
  id: string;
  label: string;
  description: string;
  rootDir: string;
}

interface SkillTargetPlan {
  primaryTarget: SkillTarget | null;
  allAgentTargets: SkillTarget[];
}

interface TargetActionPick extends vscode.QuickPickItem {
  action: 'primary' | 'choose-folder';
}

interface BundledInstallPlan {
  source: SkillSource;
  target: SkillTarget;
  skills: ExportableSkill[];
  usesFallbackSource: boolean;
}

interface BundledInstallPick extends vscode.QuickPickItem {
  plan: BundledInstallPlan;
}

interface SkillInstallRecord {
  skillId: string;
  targetLabel: string;
  targetPath: string;
}

const bundledSourceIdPrefix = 'bundled-';
const workspaceTargetIdPrefix = 'workspace-';
const configuredTargetId = 'workspace-configured';

const skillAgentProfiles = [
  {
    id: 'claude',
    bundledLabel: 'Bundled Claude',
    workspaceLabel: 'Workspace .claude/skills',
    workspacePathSegments: ['.claude', 'skills'],
  },
  {
    id: 'agents',
    bundledLabel: 'Bundled Agents',
    workspaceLabel: 'Workspace .agents/skills',
    workspacePathSegments: ['.agents', 'skills'],
  },
  {
    id: 'codex',
    bundledLabel: 'Bundled Codex',
    workspaceLabel: 'Workspace .codex/skills',
    workspacePathSegments: ['.codex', 'skills'],
  },
  {
    id: 'gemini',
    bundledLabel: 'Bundled Gemini',
    workspaceLabel: 'Workspace .gemini/skills',
    workspacePathSegments: ['.gemini', 'skills'],
  },
  {
    id: 'cursor',
    bundledLabel: 'Bundled Cursor',
    workspaceLabel: 'Workspace .cursor/skills',
    workspacePathSegments: ['.cursor', 'skills'],
  },
] as const;

const bundledProfiles = skillAgentProfiles.map((profile) => ({
  id: profile.id,
  label: profile.bundledLabel,
}));

const excludedNames = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'desktop.ini']);
let skillInventoryChannel: vscode.OutputChannel | null = null;

export async function downloadSkillFolderCommand(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = resolveWorkspaceFolder();
  const sources = await resolveSkillSources(context, workspaceFolder);

  if (sources.length === 0) {
    void vscode.window.showErrorMessage('Agent Docs: No bundled or workspace skill folders were found.');
    return;
  }

  const workflow = await pickSkillWorkflow(sources, workspaceFolder);
  if (!workflow) return;

  if (workflow === 'install-bundled-matching') {
    await installBundledSkillsToMatchingWorkspace(sources, workspaceFolder);
    return;
  }

  if (workflow === 'export-zip') {
    await exportSkillZipFromSources(sources, workspaceFolder);
    return;
  }

  const source = await pickSkillSource(sources);
  if (!source) return;

  const skills = await scanExportableSkills(source);
  if (skills.length === 0) {
    void vscode.window.showErrorMessage(`Agent Docs: No skill folders with SKILL.md found in ${source.rootDir}.`);
    return;
  }

  const targetPlan = await resolveSkillUpdateTargets(context, workspaceFolder, source);
  const action = await pickSkillAction(source, targetPlan);
  if (!action) return;

  const useAllAgentTargets = action === 'update-one-all-agents' || action === 'update-all-agents';

  if (action === 'update-all' || action === 'update-all-agents') {
    const selectedTargets = useAllAgentTargets
      ? resolveAllAgentTargets(targetPlan)
      : await pickUpdateTargets(source, targetPlan.primaryTarget);
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

  if (action === 'update-one-all-agents') {
    const selectedTargets = resolveAllAgentTargets(targetPlan);
    if (!selectedTargets || selectedTargets.length === 0) return;
    await updateSkillFolders([skill], selectedTargets);
    return;
  }

  await downloadSkillAsZip(skill, workspaceFolder);
}

async function exportSkillZipFromSources(
  sources: SkillSource[],
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<void> {
  const source = await pickSkillSource(sources, 'Choose the skill source to export from');
  if (!source) return;

  const skills = await scanExportableSkills(source);
  if (skills.length === 0) {
    void vscode.window.showErrorMessage(`Agent Docs: No skill folders with SKILL.md found in ${source.rootDir}.`);
    return;
  }

  const skill = await pickSkill(skills, 'Choose a skill folder to export as ZIP');
  if (!skill) return;
  await downloadSkillAsZip(skill, workspaceFolder);
}

async function installBundledSkillsToMatchingWorkspace(
  sources: SkillSource[],
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<void> {
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage('Agent Docs: Open a workspace before installing bundled skills.');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const bundledSourcesByProfile = new Map<string, SkillSource>();
  for (const source of sources.filter((candidate) => candidate.id.startsWith(bundledSourceIdPrefix))) {
    const profile = skillAgentProfileForSource(source);
    if (profile) bundledSourcesByProfile.set(profile.id, source);
  }
  const fallbackSource = bundledSourcesByProfile.get('codex') ?? bundledSourcesByProfile.get('agents') ?? bundledSourcesByProfile.get('claude') ?? null;
  const skillsBySource = new Map<string, ExportableSkill[]>();
  const plans: BundledInstallPlan[] = [];
  for (const profile of skillAgentProfiles) {
    const source = bundledSourcesByProfile.get(profile.id) ?? fallbackSource;
    if (!source) continue;
    const cachedSkills = skillsBySource.get(source.id);
    const skills = cachedSkills ?? await scanExportableSkills(source);
    skillsBySource.set(source.id, skills);
    if (skills.length === 0) continue;
    plans.push({
      source,
      skills,
      usesFallbackSource: !bundledSourcesByProfile.has(profile.id),
      target: {
        id: workspaceTargetIdForAgent(profile.id),
        label: profile.workspaceLabel,
        description: path.join(workspaceRoot, ...profile.workspacePathSegments),
        rootDir: path.normalize(path.join(workspaceRoot, ...profile.workspacePathSegments)),
      },
    });
  }

  if (plans.length === 0) {
    void vscode.window.showErrorMessage('Agent Docs: No bundled skill folders with SKILL.md were found.');
    return;
  }

  const selectedPlans = await pickBundledInstallPlans(plans);
  if (!selectedPlans || selectedPlans.length === 0) return;

  const summary = selectedPlans
    .map((plan) => {
      const relativeTarget = vscode.workspace.asRelativePath(vscode.Uri.file(plan.target.rootDir), false);
      const fallbackText = plan.usesFallbackSource ? ' fallback' : '';
      return `${plan.source.label}${fallbackText} -> ${relativeTarget} (${plan.skills.length} skill${plan.skills.length === 1 ? '' : 's'})`;
    })
    .join('\n');
  const confirm = await vscode.window.showWarningMessage(
    `Agent Docs will install/update bundled skills into the selected workspace agent folders.\n\n${summary}`,
    { modal: true },
    'Install / Update Selected',
  );
  if (confirm !== 'Install / Update Selected') return;

  try {
    const totalOperations = selectedPlans.reduce((total, plan) => total + plan.skills.length, 0);
    const installed: SkillInstallRecord[] = [];
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Agent Docs: Installing bundled skills',
        cancellable: false,
      },
      async (progress) => {
        let done = 0;
        for (const plan of selectedPlans) {
          await fs.mkdir(plan.target.rootDir, { recursive: true });
          for (const skill of plan.skills) {
            progress.report({
              message: `${skill.id} -> ${plan.target.label}`,
              increment: totalOperations > 0 ? 100 / totalOperations : undefined,
            });
            const targetPath = await replaceSkillFolder(skill, plan.target);
            installed.push({ skillId: skill.id, targetLabel: plan.target.label, targetPath });
            done += 1;
          }
        }
        progress.report({ message: `${done} update${done === 1 ? '' : 's'} complete` });
      },
    );
    showSkillInventorySummary({
      title: 'Agent Docs: Bundled skills installed',
      installed,
      next: 'Reload VS Code or restart the target agent if newly installed skills are not picked up immediately.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Agent Docs: Failed to install bundled skills - ${message}`);
    return;
  }

  const installedTargets = selectedPlans
    .map((plan) => vscode.workspace.asRelativePath(vscode.Uri.file(plan.target.rootDir), false))
    .join(', ');
  void vscode.window.showInformationMessage(`Agent Docs: Installed bundled skills into ${installedTargets}.`);
}

async function pickBundledInstallPlans(plans: BundledInstallPlan[]): Promise<BundledInstallPlan[] | null> {
  const picks: BundledInstallPick[] = await Promise.all(plans.map(async (plan) => {
    const relativeTarget = vscode.workspace.asRelativePath(vscode.Uri.file(plan.target.rootDir), false);
    const fallbackText = plan.usesFallbackSource ? `Uses ${plan.source.label} because no matching bundled set exists yet.` : 'Uses the matching bundled skill set.';
    return {
      label: plan.target.label,
      description: `${plan.skills.length} skill${plan.skills.length === 1 ? '' : 's'} -> ${relativeTarget}`,
      detail: `${fallbackText} Target: ${plan.target.rootDir}`,
      picked: !plan.usesFallbackSource || await directoryExists(plan.target.rootDir),
      plan,
    };
  }));
  const selected = await vscode.window.showQuickPick<BundledInstallPick>(picks, {
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder: 'Select workspace agent folders to install/update. Use the checkbox menu to select all if needed.',
    title: 'Install bundled skills to selected agent folders',
  });
  return selected?.map((pick) => pick.plan) ?? null;
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
    saveLabel: 'Export Skill ZIP',
    title: `Export ${skill.id} as ZIP`,
  });
  if (!saveUri) return;

  if (isSameOrInside(saveUri.fsPath, skill.dir)) {
    void vscode.window.showErrorMessage('Agent Docs: Save the ZIP outside the skill folder to avoid archiving itself.');
    return;
  }

  try {
    await fs.mkdir(path.dirname(saveUri.fsPath), { recursive: true });
    await zipSkillFolder(skill.dir, saveUri.fsPath, safeFileName(skill.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Agent Docs: Failed to download skill folder - ${message}`);
    return;
  }

  const revealAction = 'Reveal in Explorer';
  const action = await vscode.window.showInformationMessage(
    `Agent Docs: Skill folder downloaded to ${saveUri.fsPath}`,
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
  if (workspaceSkillsDir && await hasExportableSkill(workspaceSkillsDir)) {
    sources.push({
      id: 'workspace',
      label: 'Workspace configured skillsDir',
      description: workspaceSkillsDir,
      rootDir: workspaceSkillsDir,
    });
  }

  return sources;
}

async function hasExportableSkill(rootDir: string): Promise<boolean> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (await fileExists(path.join(rootDir, entry.name, 'SKILL.md'))) return true;
  }
  return false;
}

async function firstExistingDirectory(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return path.normalize(candidate);
  }
  return null;
}

async function pickSkillWorkflow(
  sources: SkillSource[],
  workspaceFolder: vscode.WorkspaceFolder | null,
): Promise<WorkflowPick['action'] | null> {
  const hasBundledSources = sources.some((source) => source.id.startsWith(bundledSourceIdPrefix));
  const items: WorkflowPick[] = [];
  if (hasBundledSources) {
    items.push({
      label: 'Install bundled skills to this workspace',
      description: workspaceFolder ? 'Choose Claude, Agents, Codex, Gemini, Cursor targets' : 'Open a workspace first',
      detail: 'Recommended: multi-select the workspace agent folders you want to update from bundled skills.',
      action: 'install-bundled-matching',
    });
  }
  items.push(
    {
      label: 'Export one skill as ZIP',
      description: 'Portable archive',
      detail: 'Save a selected bundled or workspace skill folder so another agent can install it manually.',
      action: 'export-zip',
    },
    {
      label: 'Advanced: choose source and target',
      description: 'Manual install/update options',
      detail: 'Pick a source first, then choose whether to update one skill, all skills, or custom workspace folders.',
      action: 'advanced',
    },
  );

  const picked = await vscode.window.showQuickPick<WorkflowPick>(items, {
    ignoreFocusOut: true,
    placeHolder: 'Install bundled skills to workspace, export a ZIP, or choose advanced options?',
  });
  return picked?.action ?? null;
}

async function pickSkillSource(sources: SkillSource[], placeHolder = 'Choose the skill source to install/export from'): Promise<SkillSource | null> {
  const picked = await vscode.window.showQuickPick<SourcePick>(
    sources.map((source) => ({
      label: source.label,
      description: source.id,
      detail: source.description,
      source,
    })),
    {
      ignoreFocusOut: true,
      placeHolder,
    },
  );
  return picked?.source ?? null;
}

async function pickSkillAction(source: SkillSource, targetPlan: SkillTargetPlan): Promise<ActionPick['action'] | null> {
  const { primaryTarget, allAgentTargets } = targetPlan;
  const hasTarget = Boolean(primaryTarget);
  const hasAllAgentTargets = allAgentTargets.length > 0;
  const targetLabel = primaryTarget?.label || targetLabelForSource(source);
  const items: ActionPick[] = [
    {
      label: 'Export selected skill as ZIP',
      description: 'Save a portable archive',
      detail: 'Use this when you want to send one skill folder to another agent manually.',
      action: 'zip-one',
    },
  ];

  if (hasTarget) {
    items.push(
      {
        label: `Update selected skill in ${targetLabel}`,
        description: primaryTarget?.rootDir,
        detail: 'Replace the matching skill folder in the workspace target that matches the chosen source. Missing folders are created automatically.',
        action: 'update-one',
      },
    );
  }

  if (hasAllAgentTargets) {
    items.push(
      {
        label: 'Update selected skill in all workspace agent folders',
        description: `${allAgentTargets.length} targets`,
        detail: 'Create/update this skill in .claude, .agents, .codex, .gemini, .cursor, and any future configured agent target.',
        action: 'update-one-all-agents',
      },
    );
  }

  if (hasTarget) {
    items.push(
      {
        label: `Update all ${source.label.replace(/^Bundled\s+/, '')} skills`,
        description: primaryTarget?.rootDir,
        detail: 'Replace every skill from the chosen source in the matching workspace target. Missing folders are created automatically.',
        action: 'update-all',
      },
    );
  }

  if (hasAllAgentTargets) {
    items.push({
      label: `Update all ${source.label.replace(/^Bundled\s+/, '')} skills in all workspace agent folders`,
      description: `${allAgentTargets.length} targets`,
      detail: 'Create/update every skill from this source across all known workspace agent skill folders.',
      action: 'update-all-agents',
    });
  }

  const picked = await vscode.window.showQuickPick<ActionPick>(items, {
    ignoreFocusOut: true,
    placeHolder: hasTarget || hasAllAgentTargets
      ? `Export a ZIP, update ${targetLabel}, or apply to all agent folders?`
      : `No matching ${targetLabel} folder detected. Export as ZIP?`,
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
    for (const profile of skillAgentProfiles) {
      addCandidate(
        workspaceTargetIdForAgent(profile.id),
        profile.workspaceLabel,
        path.join(workspaceRoot, ...profile.workspacePathSegments),
      );
    }
    addCandidate(configuredTargetId, 'Workspace configured skillsDir', resolveWorkspaceSkillsDir(workspaceFolder));
  }

  const extensionSkillsRoot = path.join(context.extensionPath, 'ai_skills');
  const deduped = new Map<string, SkillTarget>();
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate.rootDir);
    const key = normalizeForCompare(normalized);
    if (deduped.has(key)) continue;
    if (normalizeForCompare(normalized) === normalizeForCompare(source.rootDir)) continue;
    if (isSameOrInside(normalized, extensionSkillsRoot)) continue;
    deduped.set(key, {
      ...candidate,
      rootDir: normalized,
    });
  }

  const targets = [...deduped.values()];
  const primaryId = targetIdForSource(source);
  const primaryTarget = targets.find((target) => target.id === primaryId) ?? null;
  const allAgentTargets = targets.filter((target) => isWorkspaceAgentTarget(target));

  return { primaryTarget, allAgentTargets };
}

async function pickUpdateTargets(source: SkillSource, primaryTarget: SkillTarget | null): Promise<SkillTarget[] | null> {
  const targetLabel = targetLabelForSource(source);
  if (!primaryTarget) {
    void vscode.window.showErrorMessage(`Agent Docs: No matching ${targetLabel} folder was detected in this workspace.`);
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
    void vscode.window.showErrorMessage(`Agent Docs: Skill updates are workspace-only. ${outsideWorkspace.fsPath} is outside the current workspace.`);
    return null;
  }
  for (const uri of selected) {
    if (await fileExists(path.join(uri.fsPath, 'SKILL.md'))) {
      void vscode.window.showErrorMessage(
        `Agent Docs: Choose a skill root folder such as .claude/skills, not an individual skill folder: ${uri.fsPath}`,
      );
      return null;
    }
  }
  return selected.map((uri, index) => ({
    id: `chosen-${index}`,
    label: path.basename(uri.fsPath) || uri.fsPath,
    description: uri.fsPath,
    rootDir: path.normalize(uri.fsPath),
  }));
}

function resolveAllAgentTargets(targetPlan: SkillTargetPlan): SkillTarget[] | null {
  if (targetPlan.allAgentTargets.length > 0) return targetPlan.allAgentTargets;

  void vscode.window.showErrorMessage('Agent Docs: No workspace agent skill folders are available for this source.');
  return null;
}

function targetIdForSource(source: SkillSource): string {
  const profile = skillAgentProfileForSource(source);
  return profile ? workspaceTargetIdForAgent(profile.id) : configuredTargetId;
}

function targetLabelForSource(source: SkillSource): string {
  const profile = skillAgentProfileForSource(source);
  if (profile) return profile.workspaceLabel;
  return 'Workspace configured skillsDir';
}

function skillAgentProfileForSource(source: SkillSource): (typeof skillAgentProfiles)[number] | null {
  if (!source.id.startsWith(bundledSourceIdPrefix)) return null;
  const profileId = source.id.slice(bundledSourceIdPrefix.length);
  return skillAgentProfiles.find((profile) => profile.id === profileId) ?? null;
}

function workspaceTargetIdForAgent(agentId: string): string {
  return `${workspaceTargetIdPrefix}${agentId}`;
}

function isWorkspaceAgentTarget(target: SkillTarget): boolean {
  return skillAgentProfiles.some((profile) => target.id === workspaceTargetIdForAgent(profile.id));
}

async function updateSkillFolders(skills: ExportableSkill[], targets: SkillTarget[]): Promise<void> {
  const totalOperations = skills.length * targets.length;
  if (totalOperations === 0) return;

  const targetSummary = targets.map((target) => target.rootDir).join('\n');
  const confirm = await vscode.window.showWarningMessage(
    `Agent Docs will replace ${skills.length} skill folder${skills.length === 1 ? '' : 's'} in ${targets.length} workspace skill root${targets.length === 1 ? '' : 's'}.\n\n${targetSummary}`,
    { modal: true },
    'Update',
  );
  if (confirm !== 'Update') return;

  try {
    const installed: SkillInstallRecord[] = [];
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Agent Docs: Updating ${skills.length} skill folder${skills.length === 1 ? '' : 's'}`,
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
            const targetPath = await replaceSkillFolder(skill, target);
            installed.push({ skillId: skill.id, targetLabel: target.label, targetPath });
            done += 1;
          }
        }
        progress.report({ message: `${done} update${done === 1 ? '' : 's'} complete` });
      },
    );
    showSkillInventorySummary({
      title: 'Agent Docs: Skill folders updated',
      installed,
      next: 'Reload VS Code or restart the target agent if updated skills are not picked up immediately.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Agent Docs: Failed to update skill folder(s) - ${message}`);
    return;
  }

  const rootText = targets.length === 1 ? targets[0].rootDir : `${targets.length} workspace skill roots`;
  void vscode.window.showInformationMessage(
    `Agent Docs: Updated ${skills.length} skill folder${skills.length === 1 ? '' : 's'} in ${rootText}.`,
  );
}

async function replaceSkillFolder(skill: ExportableSkill, target: SkillTarget): Promise<string> {
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
  return targetDir;
}

function showSkillInventorySummary(options: {
  title: string;
  installed: SkillInstallRecord[];
  next: string;
}): void {
  const channel = skillInventoryChannel ?? vscode.window.createOutputChannel('Agent Docs Skills');
  skillInventoryChannel = channel;
  channel.clear();
  channel.appendLine(options.title);
  channel.appendLine('');
  channel.appendLine('Installed');
  if (options.installed.length) {
    for (const item of options.installed) {
      channel.appendLine(`- ${item.skillId} -> ${item.targetLabel}`);
      channel.appendLine(`  ${item.targetPath}`);
    }
  } else {
    channel.appendLine('- None');
  }
  channel.appendLine('');
  channel.appendLine('Skipped');
  channel.appendLine('- None');
  channel.appendLine('');
  channel.appendLine('Failed');
  channel.appendLine('- None');
  channel.appendLine('');
  channel.appendLine('Next');
  channel.appendLine(`- ${options.next}`);
  channel.show(true);
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
    vscode.workspace.getConfiguration('markdownAgentDocs').get<string>('skillsDir', 'claude_skills/skills') || '',
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
