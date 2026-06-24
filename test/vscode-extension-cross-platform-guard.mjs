import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const extensionPackage = JSON.parse(await readFile(new URL('../vscode-extension/package.json', import.meta.url), 'utf8'));
const sourceGraphSource = await readFile(new URL('../vscode-extension/src/commands/sourceGraph.ts', import.meta.url), 'utf8');
const fileBrowserProviderSource = await readFile(
  new URL('../vscode-extension/src/providers/markdownFileTreeProvider.ts', import.meta.url),
  'utf8',
);
const extensionGuide = await readFile(new URL('../vscode-extension/EXTENSION_GUIDE.md', import.meta.url), 'utf8');
const extensionReadme = await readFile(new URL('../vscode-extension/README.md', import.meta.url), 'utf8');
const buildTemplateBuilderSource = await readFile(
  new URL('../vscode-extension/tools/build-tb-vscode.mjs', import.meta.url),
  'utf8',
);
const syncBundleSource = await readFile(new URL('../vscode-extension/tools/sync-cli-bundle.mjs', import.meta.url), 'utf8');

const packagedFiles = new Set(extensionPackage.files || []);
for (const expected of [
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
  'Install Codex MCP should create/update the graph DB before writing the MCP config block',
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
    doc.includes('MD Studio: Install Codex Source Graph MCP'),
    'User docs should explain Codex MCP setup',
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
