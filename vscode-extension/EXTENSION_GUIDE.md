# Agent Docs for Markdown Extension Guide

This guide explains how to install, use, and troubleshoot the `markdown-agent-docs` extension.

## 1) Quick Start

### Package

```bash
cd vscode-extension
npm install
npm run build
npm run package:vsix
```

### Install

```bash
code --install-extension .\markdown-agent-docs-0.1.40.vsix --force
```

### Basic Usage

1. Open a `.md` file inside the workspace.
2. Run `Agent Docs: Preview` from Command Palette (`Ctrl+Shift+P`).
3. Save the file (`Ctrl+S`) to auto-refresh preview.
4. Use `Agent Docs: Refresh Preview` for manual force refresh.
5. Use `Agent Docs: Export Styled HTML` to export the currently open markdown file as styled HTML.
6. Use `Agent Docs: Open in Viewer` from the Agent Docs File Browser sidebar or Command Palette. From the palette it falls back to the active markdown document and shows a clear message if no markdown target is available.
7. Use `Agent Docs: Install or Export Skills` to install bundled skills into workspace agent folders or export a skill as a ready-to-share ZIP folder.
8. Right-click a folder in the Agent Docs File Browser sidebar and choose `FOCUS` to narrow only that browser until `Agent Docs: Clear Folder Focus` is run.
9. Use the preview `Style` menu to switch document appearance; the selected style is reused for preview refresh and HTML transform.
10. Use `Agent Docs: Initialize Source Graph` once per workspace when you want a document graph DB at `.mps/source-graph.sqlite`.
11. Use `Agent Docs: Edit Source Ignore` when generated folders or low-signal documents should be excluded from both the graph and the Agent Docs File Browser.

## 2) Cursor Sync on Save (Ctrl+S)

When `markdownAgentDocs.cursorSyncOnSave=true`, save triggers this sequence:

1. Render markdown through the CLI.
2. Resolve current cursor line.
3. Parse sections with `parseMarkdownDocument` from `public/core/engine.js`.
4. Pick the last section whose line is less than or equal to the cursor line.
5. Send a sync message to the webview.
6. Move preview using outline-first navigation (`data-outline-id`).

Notes:

- Sync is section-based (heading), not paragraph-exact.
- If no heading exists, render still runs and sync is skipped.

## 3) Settings

- `markdownAgentDocs.autoOnSave`
  - Controls auto render on save.
  - Default: `true`
- `markdownAgentDocs.cursorSyncOnSave`
  - Controls section sync after save render.
  - Default: `true`
- `markdownAgentDocs.nodePath`
  - Node executable path used to run CLI.
  - Default: `"node"`
- `markdownAgentDocs.cliScriptPath`
  - CLI script path.
  - Default value uses the extension-bundled CLI first.
  - Custom relative path: resolved from workspace root.
  - Absolute path: used as-is.
  - Default: `"scripts/md-to-html.mjs"`
- `markdownAgentDocs.extraArgs`
  - Extra CLI arguments.
  - Default: `["--standalone"]`
- `markdownAgentDocs.preferredViewMode`
  - Preview presentation mode.
  - `auto`: switch to stack on narrow webview.
  - `slides`: always prefer slides.
  - `stack`: always prefer stack.
  - Default: `"stack"`
- `markdownAgentDocsFileBrowser.extraExtensions`
  - Additional file extensions shown in the Agent Docs File Browser.
  - Markdown extensions are always included.
  - Default: `[]`

Viewer appearance:

- The preview `Style` menu stores appearance in workspace state, not user settings.
- Stored values are passed to the bundled CLI as `--appearance`, `--appearance-background`, `--appearance-radius`, `--appearance-frame`, and `--viewer-chrome` only when they differ from defaults.
- Markdown frontmatter may also set `appearance`, `appearanceBackground`, `appearanceRadius`, `appearanceFrame`, and `viewerChrome`.

Outline state:

- Outline hide/show state is remembered per markdown document.
- Default for new documents is expanded (open).

## 4) Skill Install / Export

`Agent Docs: Install or Export Skills` is available from the Command Palette and the Agent Docs File Browser sidebar title bar.

1. Choose `Install bundled skills to this workspace` for the normal setup flow.
2. The extension installs each available bundled source into its matching workspace agent target: Bundled Claude -> `.claude/skills`, Bundled Agents -> `.agents/skills`, Bundled Codex -> `.codex/skills`, Bundled Gemini -> `.gemini/skills`, Bundled Cursor -> `.cursor/skills`.
3. Choose `Export one skill as ZIP` when you want a portable archive for manual installation in another tool.
4. Choose `Advanced: choose source and target` when you need source-by-source updates, selected-skill updates, or a custom workspace skill root.
5. Missing target folders are created automatically before files are copied.
6. For custom targets, choose a skill root folder such as `.claude/skills`, not an individual skill folder such as `.claude/skills/md-presentation-composer`.
7. If saving a ZIP, choose a skill folder with a root `SKILL.md`, then pick a save location. The output archive is named `{skill-id}.zip` by default.
8. Extract the ZIP where your AI tool expects skills. The ZIP keeps the skill folder at the archive root.

Bundled skills are copied into the VSIX during `npm run build`, so installed users can export them without cloning the repository.

## 5) Source Graph, Skill, And Workspace DB

Source Graph is the document-link index for one VS Code workspace. It creates `.mps/source-graph.sqlite`, a local SQLite DB with document, heading, link, citation, search-index, node, and edge data.

### First-time setup for normal users

1. Install the VSIX.
2. Open the folder that contains your Markdown documents in VS Code.
3. Run `Agent Docs: Initialize Source Graph`.
4. Confirm `.mps/source-graph.sqlite` exists in that workspace.
5. Run `Agent Docs: Install or Export Skills`, then choose `Install bundled skills to this workspace`.
6. Confirm `markdown-workspace-search` appears under the matching workspace skill roots such as `.codex/skills`, `.agents/skills`, or `.claude/skills`.
7. In Codex, ask it to use the `markdown-workspace-search` skill for a document question. The skill should run `node scripts/source-graph.mjs search --root . --query "README" --limit 3 --include-links --links-depth 1 --include-headings`.
8. Ask it to summarize `Path`, `Title`, `Why it matters`, `Heading evidence`, `Link evidence`, and `Next action`.

This is the Source Graph equivalent of a project-local init step such as `codegraph init`: each workspace owns its own `.mps/source-graph.sqlite`.

### Ignoring documents

Run `Agent Docs: Edit Source Ignore` to open the workspace `.mps/.mpsignore` file. The file uses gitignore-style glob lines and affects both Source Graph indexing and the Agent Docs File Browser list. Existing root `.mpsignore` files are still read as a legacy fallback.

Example:

```gitignore
.agents/**
.claude/**
raw/**
**/drafts/**
*.draft.md
```

After editing `.mpsignore`, run `Agent Docs: Update Source Graph` or reopen Source Graph. The file browser refreshes automatically when `.mpsignore` changes.

### Updating behavior

- `Agent Docs: Open Source Graph` refreshes the DB before showing the graph.
- `Agent Docs: Update Source Graph` rebuilds the DB manually.
- Saving an existing Markdown file updates that file's graph rows and recomputes resolved edges.
- Creating or deleting a Markdown file triggers a full rebuild after a short debounce.
- Creating, editing, or deleting `.mpsignore` triggers a full rebuild after a short debounce.

### How to verify updates

1. Create two files, `a.md` and `b.md`.
2. Add `[B](b.md)` in `a.md`.
3. Run `Agent Docs: Initialize Source Graph`.
4. Open Source Graph and select `a.md`; `b.md` should appear as an outbound linked file.
5. Change the link to another Markdown file and save.
6. Reopen or update Source Graph; the outbound edge should change.

### CLI commands used by the Markdown workspace search skill

- `node scripts/source-graph.mjs update --root .`: rebuilds `.mps/source-graph.sqlite`.
- `node scripts/source-graph.mjs search --root . --query "topic" --include-links --links-depth 1 --include-headings`: searches indexed documents with linked context and heading evidence.
- `node scripts/source-graph.mjs related --root . --path "README.md" --include-headings`: finds related documents around a query or path.
- `node scripts/source-graph.mjs neighbors --root . --path "README.md"`: returns inbound/outbound neighbors for a document.

The bundled Codex skill `markdown-workspace-search` tells Codex when to run these commands for document discovery, backlink checks, related sources, and stale-index refreshes. `search` and `related` collapse duplicate skill copies by default so results are closer to codegraph-style focused context. Pass `--include-copies` only when auditing whether `.codex`, `.agents`, and bundled skill folders are synced.

For a full first-install-to-agent-search checklist, see `docs/planning/source-graph-cli-skill-qa.md` in the repository root.
## 6) Folder Focus

`FOCUS` is available from folder items in the Agent Docs File Browser sidebar.

1. Pick a folder and run `FOCUS`.
2. The extension stores that folder as the Agent Docs File Browser focus root.
3. The Agent Docs File Browser tree shows configured files under that folder and hides sibling branches inside the extension view only.
4. VS Code Explorer and workspace `files.exclude` are not modified.
5. `Agent Docs: Clear Folder Focus` clears the browser focus and also removes legacy Explorer exclude rules if an older experimental build recorded them.

For a nested folder such as `docs/guides`, the Agent Docs File Browser sidebar keeps the path to that folder visible and omits sibling branches from the Agent Docs tree.

## 7) Viewer Appearance

Appearance is a presentation layer above `theme` and `design`.

- `Default` preserves current rendering.
- `Clean` removes visual weight and shadows.
- `Flat` removes rounded cards and emphasizes simple lines.
- `Reader` reduces card framing for long-form review.
- `Print` uses white, low-decoration output.

Detail controls override the preset: background (`default | plain | transparent`), corners (`default | soft | none`), frame (`default | lines | none`), and viewer chrome (`full | minimal | hidden`).

## 8) Runtime Flow

1. Extension receives preview command or save event.
2. Resolves CLI path in this order:
   - bundled CLI (`<extension>/scripts/md-to-html.mjs`) when `markdownAgentDocs.cliScriptPath` is the default value
   - custom `markdownAgentDocs.cliScriptPath` when a relative or absolute path is configured
   - manual picker (`Select Script`) as final fallback
3. Resolves parser path for cursor sync:
   - workspace `public/core/engine.js`
   - bundled parser (`<extension>/public/core/engine.js`) fallback
4. Runs CLI and loads rendered HTML.
5. Rewrites `file://` asset URLs with `webview.asWebviewUri(...)`.
6. Injects bridge script (cursor sync, preferred mode, outline state persistence).

## 9) Troubleshooting

### Preview does not open

- Confirm the file is a markdown file in the current workspace.
- If `Agent Docs: Open in Viewer` is run from Command Palette, keep a markdown editor active or select a markdown file from the sidebar first.
- Confirm `markdownAgentDocs.cliScriptPath` points to an existing script path.
- Confirm `markdownAgentDocs.nodePath` points to a valid Node executable.
- If `cliScriptPath` is default, extension tries the bundled CLI first.
- If `cliScriptPath` is customized, that path is used as-is (no bundled auto override).
- If script is still missing, click `Select Script` in the popup and choose `md-to-html.mjs`.

Example (absolute path):

```json
{
  "markdownAgentDocs.cliScriptPath": "C:\\Users\\leesu\\Documents\\ProjectCode\\01_2026_EXP\\agent-docs-for-markdown\\scripts\\md-to-html.mjs"
}
```

### Outline keeps reopening

- Update to the latest extension.
- Hide once; subsequent refresh/save should preserve collapsed state for that document.

### `Open in Viewer` command shows an error

- Update to the latest extension.
- The command now validates command arguments before opening a file.
- If no file is passed by VS Code, it uses the active markdown document instead of failing on an undefined URI.

### Skill download has no sources

- Run `npm run build` before testing from source so bundled `ai_skills` are copied into `vscode-extension/ai_skills`.
- Confirm `markdownAgentDocs.skillsDir` points to a directory whose children contain `SKILL.md`.

### Source Graph DB or Skill does not appear

- Run `Agent Docs: Update Source Graph`.
- Confirm Node.js is installed and `markdownAgentDocs.nodePath` points to a working `node` executable.
- Confirm the workspace has `scripts/source-graph.mjs` when asking an agent to run CLI searches.
- Run `Agent Docs: Initialize Source Graph` again if `.mps/source-graph.sqlite` is missing.
- Run `Agent Docs: Install or Export Skills`, then choose `Install bundled skills to this workspace` again if `.codex/skills/markdown-workspace-search`, `.agents/skills/markdown-workspace-search`, or `.claude/skills/markdown-workspace-search` is missing.

## 10) Development Notes

- Source: `vscode-extension/src/extension.ts`
- Build: `npm run build`
- Package: `npm run package:vsix`
- Install test: `code --install-extension .\markdown-agent-docs-0.1.40.vsix --force`

## 11) Uninstall / Cleanup Guide

### Uninstall extension

```bash
code --uninstall-extension datanewbie-labs.markdown-agent-docs
```

### Check installed version

```bash
code --list-extensions --show-versions
```

Find `datanewbie-labs.markdown-agent-docs@...` in the list.

### Remove packaged file (.vsix)

If you no longer need the package file, delete:

```text
vscode-extension/markdown-agent-docs-0.1.40.vsix
```

### Optional: remove local extension folder manually

If needed, remove this folder:

```text
%USERPROFILE%\.vscode\extensions\datanewbie-labs.markdown-agent-docs-0.1.40
```
