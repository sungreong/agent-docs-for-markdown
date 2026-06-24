# Markdown Pattern Studio

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Markdown%20Pattern%20Studio%20Preview-0078d4?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-pattern-studio-preview)

Markdown Pattern Studio is a markdown-first renderer for polished reports, slide-style documents, and blog-ready HTML. It includes a browser studio, a CLI renderer, and the published VS Code extension **Markdown Pattern Studio Preview**.

Korean documentation is available in [README.ko.md](README.ko.md).

## See It In Action

### 1. VS Code Extension Workflow

![Markdown Pattern Studio Preview in VS Code](assets/images/extension_example.png)

Use the MD Studio File Browser to focus a folder, sort/filter Markdown files, preview a document, navigate the outline, and export HTML without leaving VS Code.

### 2. Browser Studio

![Markdown Pattern Studio web editor](assets/images/web.png)

The browser studio combines a pattern guide, Markdown editor, live preview, Template Builder, appearance controls, and export actions in one workspace.

### 3. Standalone HTML Result

![Standalone Markdown Pattern Studio HTML result](assets/images/result.png)

Standalone exports keep the polished reader, outline, zoom controls, Slide/Stack modes, and local image embedding for portable sharing.

### 4. VS Code Extension 0.1.34 Updates

![Markdown Pattern Studio Preview 0.1.34 update highlights](assets/images/vscode-extension-0.1.34-updates.png)

Since `0.1.32`, the extension adds a Source Graph workflow, Codex MCP setup commands, blog-safe HTML export targets, stronger render-quality guards, and a custom MD activity icon so the file browser is easier to recognize in the Activity Bar.

### 5. Source Graph Webview

![Markdown Pattern Studio Source Graph webview](assets/images/source-graph-vsix-preview.png)

The Source Graph view turns local Markdown files into a workspace graph of documents, headings, links, citations, and related neighbors. It is designed for large writing workspaces where you need to see how notes, skills, guides, and generated documents connect.

## Install The VS Code Extension

The extension is published on the Visual Studio Marketplace:

[Markdown Pattern Studio Preview](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-pattern-studio-preview)

Install from VS Code Quick Open:

```text
ext install datanewbie-labs.markdown-pattern-studio-preview
```

The extension version in this repository is `0.1.34`.

## New Since 0.1.32

The current VS Code extension builds on the `0.1.32` release with a larger workspace-navigation and publishing surface:

- **Source Graph webview**: initialize a workspace-local `.mps/source-graph.sqlite` DB, open an interactive graph view, search indexed Markdown sources, and update only changed document rows on save.
- **Codex MCP workflow**: install, copy, check, and remove the Source Graph MCP config from VS Code commands, then use the bundled Codex `source-graph-search` skill for related-source lookup.
- **`.mpsignore` support**: exclude noisy generated folders from both Source Graph indexing and the MD Studio File Browser.
- **Blog-safe HTML export**: choose Standalone HTML, Blog Embed HTML, or Content Fragment from the transform command and CLI.
- **HTML viewer support**: open generated `.html` / `.htm` files in the MD Studio Viewer with Edit Source, Refresh, and save-triggered reloads.
- **Skill export updates**: download or update bundled Claude, Agents, and Codex skills, including `document-production-advisor` and `source-graph-search`.
- **Render-quality guards**: added checks for dark slide contrast, card-grid typography, and safer document expression utilities.
- **Refined VSIX identity**: the extension now ships a custom MD book icon for the package and Activity Bar instead of the generic book symbol.

## What It Does

- Renders Markdown into styled HTML with reusable section templates.
- Supports report and slide-style pagination with `{: .page-break }`.
- Provides VS Code preview, auto-refresh on save, outline navigation, text search, and Slide/Stack viewing.
- Exports HTML as a standalone viewer, blog embed fragment, or clean content fragment.
- Embeds local images into standalone/blog exports by default so copied files keep their assets.
- Includes appearance presets: Default, Clean, Flat, Reader, and Print.
- Bundles a Template Builder and AI skill export workflow for presentation-style markdown.

## Run The Web Studio

Requirements: Node.js 18+

```bash
npm start
```

Open:

```text
http://localhost:3188
```

## CLI Usage

```bash
npm run md2html -- <input.md>
```

Examples:

```bash
# Default standalone HTML beside the input file
npm run md2html -- test/notes.md

# Full standalone viewer with theme and appearance
npm run md2html -- test/notes.md --out test/notes.styled.html --theme report --standalone

# Blog-safe copy/paste fragment for Tistory, WordPress, Velog, and narrow article containers
npm run md2html -- test/notes.md --out test/notes.blog-embed.html --export-target blog-embed

# Scoped content fragment without viewer scripts
npm run md2html -- test/notes.md --out test/notes.fragment.html --export-target fragment
```

Key options:

- `--export-target standalone|blog-embed|fragment`
- `--theme <name>`
- `--design <brand-preset>`
- `--intent report|pitch|reference|narrative`
- `--appearance default|clean|flat|reader|print`
- `--appearance-background default|plain|transparent`
- `--appearance-radius default|soft|none`
- `--appearance-frame default|lines|none`
- `--viewer-chrome full|minimal|hidden`
- `--embed-local-images` / `--no-embed-local-images`
- `--base-dir <path>`
- `--mermaid` / `--no-mermaid`

## Export Targets

### Standalone HTML

Use this when the HTML file will be opened directly in a browser or shared as a self-contained viewer. It includes Style controls, outline, Slide/Stack navigation, zoom controls, code copy buttons, and Mermaid rendering.

### Blog Embed HTML

Use this when copying generated HTML into an existing site editor such as Tistory. This target avoids site-level collisions by:

- outputting a copy/paste fragment instead of a full `html/body` document,
- scoping document CSS under `.mps-embed-root`,
- avoiding fixed viewer chrome such as floating outline and slide navigation,
- forcing paginated slide content into a readable stacked article layout,
- using container-width behavior so narrow article columns behave like mobile layouts.

This is the recommended target for the issue where standalone controls overlap with blog sidebars, bookmark buttons, AI toolbars, search buttons, or mobile floating controls.

### Content Fragment

Use this when another system will provide its own scripts and controls. It outputs scoped document HTML without viewer scripts.

## VS Code Extension

Main commands:

- `Markdown Studio: Open Preview`
- `Markdown Studio: Refresh Preview`
- `MD Studio: Open Source Graph`
- `MD Studio: Initialize Source Graph Workspace`
- `MD Studio: Update Source Graph Index`
- `MD Studio: Search Source Graph`
- `MD Studio: Edit Source Ignore`
- `MD Studio: Install Codex Source Graph MCP`
- `MD Studio: Check Codex Source Graph MCP Status`
- `MD Studio: Remove Codex Source Graph MCP`
- `MD Studio: Copy Codex Source Graph MCP Config`
- `MD Studio: Open in Viewer`
- `MD Studio: Transform Markdown to Styled HTML`
- `MD Studio: Download Skill Folder`
- `MD Studio: Diagnose Environment`

Bundled downloadable skills:

- `md-presentation-composer`: restructures Markdown into report, pitch, technical, tutorial, or presentation documents.
- `document-production-advisor`: plans and verifies export-ready Markdown for HTML/blog/DOCX/PPTX-style handoff with request-contract traces, render UX checks, expression utilities, and an included render smoke-test example.

Use `MD Studio: Download Skill Folder` when you want to hand these document-design rules to another AI agent or update the matching agent folder in the current workspace. Bundled Codex updates `.codex/skills`, Bundled Agents updates `.agents/skills`, Bundled Claude updates `.claude/skills`, and workspace skills update the configured `mdStudioPreview.skillsDir`. The ZIP keeps `SKILL.md`, references, and examples together, so you can give it to Claude, Codex, or a compatible agent and ask it to write documents using the same Markdown Pattern Studio structure, visual classes, export rules, and render-verification checklist.

When transforming Markdown to HTML, the extension asks which export target to use:

- **Standalone HTML** for local files and full-page sharing.
- **Blog Embed HTML** for copy/paste into existing sites.
- **Content Fragment** for scoped markup without viewer scripts.

Generated `.html` / `.htm` files can also be opened in the MD Studio Viewer from the File Browser. The viewer toolbar keeps Edit Source, Refresh, and save-triggered updates available for both Markdown and HTML previews.

Important settings:

- `mdStudioPreview.autoOnSave`
- `mdStudioPreview.cursorSyncOnSave`
- `mdStudioPreview.nodePath`
- `mdStudioPreview.cliScriptPath`
- `mdStudioPreview.preferredViewMode`
- `mdStudioPreview.language` (default: `"en"`, set `"ko"` for Korean extension prompts and file browser metadata)
- `mdStudioPreview.extraArgs`
- `mdStudioPreview.stripEmailDisclaimer`

## Source Graph And MCP

Markdown Pattern Studio can index local Markdown sources into a workspace-local SQLite graph database at `.mps/source-graph.sqlite`. This DB is workspace-local, similar in spirit to running `codegraph init` for a project: every workspace gets its own graph DB, and deleting `.mps/source-graph.sqlite` only removes the local index. The database contains document, heading, link, citation, and search-index tables plus graph nodes/edges.

Use `MD Studio: Edit Source Ignore` to create or edit `.mpsignore` in the workspace root. Patterns in this file are removed from both the Source Graph index and the MD Studio File Browser list, which keeps large generated folders out of the graph and improves update time. Example:

```gitignore
.agents/**
.claude/**
raw/**
**/drafts/**
*.draft.md
```

```bash
npm run source-graph:update
node scripts/source-graph.mjs update-file --path README.md
node scripts/source-graph.mjs search --query "DESIGN.md"
node scripts/source-graph.mjs related --path README.md
node scripts/source-graph.mjs neighbors --path README.md
node scripts/source-graph.mjs mcp
```

The VS Code extension adds `MD Studio: Initialize Source Graph Workspace`, `MD Studio: Open Source Graph`, `MD Studio: Update Source Graph Index`, `MD Studio: Search Source Graph`, and `MD Studio: Edit Source Ignore`. Initialize creates or rebuilds `.mps/source-graph.sqlite` for the current workspace. The graph command opens from the cached SQLite DB first, then refreshes the index in the background. When an existing Markdown file changes, the extension updates only that document's graph rows and recomputes edges; file create/delete or `.mpsignore` changes still trigger a full rebuild.

For non-technical users, use the workspace installer:

1. Install the VSIX.
2. Open the Markdown workspace in VS Code.
3. Run `MD Studio: Initialize Source Graph Workspace` once to create `.mps/source-graph.sqlite`.
4. Run `MD Studio: Install Codex Source Graph MCP`.
5. Choose `Workspace .codex/config.toml (Recommended)`.
6. Run `MD Studio: Download Skill Folder`, choose `Bundled Codex`, then update `source-graph-search` into `.codex/skills` if the skill is not already present.
7. Restart Codex or start a new Codex session for the trusted workspace.

The installer writes a managed MCP block to `.codex/config.toml`, creates/updates `.mps/source-graph.sqlite`, and keeps the MCP command pointed at the current workspace. Use `MD Studio: Check Codex Source Graph MCP Status` to verify Node, the bundled MCP script, the graph DB, and the config registration. To verify updates, edit or add a Markdown link, save the file, then run `MD Studio: Open Source Graph` or `MD Studio: Search Source Graph`; the DB timestamp and related edges should reflect the change. Use `MD Studio: Remove Codex Source Graph MCP` to remove the managed block.

`MD Studio: Copy Codex Source Graph MCP Config` is still available for manual setup or advanced users who want to paste the snippet into `~/.codex/config.toml` themselves.

MCP tools exposed by `node scripts/source-graph.mjs mcp`:

- `source_graph_update`
- `source_graph_search`
- `source_graph_related`
- `source_graph_neighbors`

The bundled Codex skill `source-graph-search` describes when to use those tools for document discovery, backlinks, related sources, and stale-index refreshes.

## Markdown Templates

Common section classes:

- `.cover`
- `.dark`
- `.half-bleed`
- `.icon-list`
- `.card`
- `.two-column`
- `.three-column`
- `.stats`
- `.compare`
- `.timeline`
- `.agenda`
- `.message`
- `.spotlight`
- `.quote-slide`

Presentation expression classes:

- `.safe-zone`: keeps important slide/banner content inside the central reading area.
- `.problem-statement`: adds a problem-slide accent treatment for pain-point sections.
- `.big-number-hero`: turns a single metric or claim into a centered oversized hero.
- `.feature-grid`: renders a list as a responsive feature-card grid.
- `.metrics-dashboard`: renders a list as compact KPI cards.
- `.contrast-pair`: lays paired before/after or old/new content side by side, then stacks on narrow screens.

Block-level helpers:

- Paragraph/list class `.gradient-number` for accent-number emphasis.
- Paragraph class `.oversized` for a large typographic statement.
- Image class `.screenshot-shadow` for product screenshots.
- Table class `.contrast-pair` for before/after comparison tables.

Example:

```markdown
---
title: Monthly Report
theme: report
intent: report
appearance: clean
---

# Monthly Report {#cover .cover eyebrow="Operations"}

## Key Metrics {: .stats}

- Revenue | 124% | +12%
- Retention | 91% | +4%

---
{: .page-break}

## What Changed {: .two-column}

### Drivers

- Better onboarding
- Faster support response

### Risks

- Mobile conversion still lags
- More QA needed before launch

## Cost of Delay {: .problem-statement}

Every slow handoff creates another review loop. The fix is a visible, testable workflow.

## 42% {: .big-number-hero}

Reduction in rewrite cycles after moving from freeform notes to structured Markdown.

## Capability Map {: .feature-grid}

- Preview in VS Code
- Blog-safe HTML export
- Stack-first mobile reading
```

## Development

```bash
npm install
npm start
```

Run focused regression checks:

```bash
npm run test:blog-embed
npm run test:document-advisor
npm run test:embed-images
```

Build the VS Code extension:

```bash
cd vscode-extension
npm install
npm run build
npm run package:vsix
```

Install the local VSIX:

```bash
code --install-extension .\markdown-pattern-studio-preview-0.1.34.vsix --force
```

## Related Files

- CLI renderer: [scripts/md-to-html.mjs](scripts/md-to-html.mjs)
- Document CSS: [public/document.css](public/document.css)
- Standalone/embed export shell: [public/core/export-standalone.js](public/core/export-standalone.js)
- VS Code extension source: [vscode-extension/src/extension.ts](vscode-extension/src/extension.ts)
- Extension guide: [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md)
- Extension Marketplace README: [vscode-extension/README.md](vscode-extension/README.md)
