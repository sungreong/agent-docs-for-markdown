# Agent Docs for Markdown

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Agent%20Docs%20for%20Markdown-0078d4?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-agent-docs)

Agent Docs for Markdown turns a local Markdown workspace into source graph evidence, packaged context, agent-ready writing skills, and polished HTML exports.

For the full Korean guide, see [README.ko.md](README.ko.md).
For VS Code extension details, see [vscode-extension/README.md](vscode-extension/README.md) and [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md).
For release history, see [CHANGELOG.md](CHANGELOG.md).

## Highlights

- VS Code extension with Agent Docs File Browser, preview, auto-refresh, outline navigation, and export commands.
- Source Graph webview for Markdown workspaces, backed by a local `.mps/source-graph.sqlite` index.
- Bundled AI skills that can be downloaded from VS Code and handed to Claude, Codex, or Agents for document writing, Markdown graph triage, ignore advice, context packaging, link repair, canonical-source review, and update planning.
- Browser studio with Markdown editing, live preview, templates, appearance controls, and HTML export.
- Export targets for standalone HTML, blog-safe embed HTML, and scoped content fragments.

## Screenshots

### VS Code Extension Updates

![Agent Docs for Markdown Preview 0.1.34 update highlights](assets/images/vscode-extension-0.1.34-updates.png)

### Source Graph Webview

![Agent Docs for Markdown Source Graph webview](assets/images/source-graph-vsix-preview.png)

### Browser Studio

![Agent Docs for Markdown web editor](assets/images/web.png)

### Standalone HTML Result

![Standalone Agent Docs for Markdown HTML result](assets/images/result.png)

## Recommended: Use The VS Code Extension

This is the easiest path for normal use. Install the extension, open a Markdown workspace, then preview, export, search, and download document-writing skills from inside VS Code.

Install from the Visual Studio Marketplace:

[Agent Docs for Markdown](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-agent-docs)

Or from VS Code Quick Open:

```text
ext install datanewbie-labs.markdown-agent-docs
```

Current repository extension version: `0.1.39`.

Common VS Code flows:

- Open Markdown files in the Agent Docs File Browser.
- Run `Agent Docs: Preview` for a live preview.
- Run `Agent Docs: Export Styled HTML` and choose by destination: a complete HTML file, blog paste HTML, or a body-only content fragment.
- Run `Agent Docs: Open Source Graph` to inspect document links.
- Run the `Source Graph` launcher at the top of the sidebar, then use `Start Graph` for guided setup or `Run Workspace Audit` to open the dedicated audit manager with table rows, pagination, compact view, and batch apply before handing Markdown graph work to an agent.
- Run `Agent Docs: Download Skill Folder` to export/update AI writing skills.

### Markdown Graph Skills

Install these with `Agent Docs: Install or Export Skills` -> `Install bundled skills to this workspace`. They help an agent use Source Graph evidence to find related Markdown files, URL/link relationships, and document cleanup targets faster than manual search.

| Skill | Use when |
| --- | --- |
| `markdown-workspace-search` | You need evidence-based answers from Markdown sources, headings, backlinks, citations, or related notes. |
| `markdown-graph-triage` | You want to understand the whole Markdown corpus: entry docs, orphan docs, noisy folders, duplicate skill copies, and weak graph structure. |
| `markdown-ignore-advisor` | You need to decide what should be excluded with `.mpsignore` so Source Graph results focus on useful documents. |
| `markdown-context-packager` | You want a compact reading bundle for a topic, URL, or target document before writing or updating anything. |
| `markdown-update-planner` | You plan to edit one document and need to know which linked, related, or backlink documents may also need review. |
| `markdown-canonicalizer` | Several Markdown pages overlap and you need to pick the primary source, merge target, archive candidate, or keep-separate decision. |
| `markdown-link-repair` | You need to repair broken internal links, stale URL references, weak backlinks, or other graph-quality problems. |

For details, see [vscode-extension/README.md](vscode-extension/README.md).

## Alternative: Clone And Use Web/CLI

Use this path when you want the browser studio, local development, scripts, tests, or direct CLI rendering.

Requirements: Node.js 18+

```bash
git clone https://github.com/sungreong/md-pattern-studio.git
cd md-pattern-studio
npm install
npm start
```

Open:

```text
http://localhost:3188
```

CLI quick use:

```bash
npm run md2html -- <input.md>
```

Examples:

```bash
npm run md2html -- test/notes.md
npm run md2html -- test/notes.md --out test/notes.styled.html --theme report --standalone
npm run md2html -- test/notes.md --out test/notes.blog-embed.html --export-target blog-embed
```

## Documentation Map

- Full Korean guide: [README.ko.md](README.ko.md)
- VS Code extension README: [vscode-extension/README.md](vscode-extension/README.md)
- VS Code extension guide: [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md)
- Source Graph CLI Skill QA: [docs/planning/source-graph-cli-skill-qa.md](docs/planning/source-graph-cli-skill-qa.md)
- Markdown workspace search skill: [ai_skills/codex/skills/markdown-workspace-search/SKILL.md](ai_skills/codex/skills/markdown-workspace-search/SKILL.md)
- MD to deck designer skill: [ai_skills/codex/skills/md-to-deck-designer/SKILL.md](ai_skills/codex/skills/md-to-deck-designer/SKILL.md)
- LLM wiki agent improvement plan: [docs/planning/llm-wiki-agent-improvement-plan.md](docs/planning/llm-wiki-agent-improvement-plan.md)
- Source Graph launcher UX checklist: [docs/planning/source-graph-launcher-ux-checklist.md](docs/planning/source-graph-launcher-ux-checklist.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- CLI renderer: [scripts/md-to-html.mjs](scripts/md-to-html.mjs)
- Source Graph CLI: [scripts/source-graph.mjs](scripts/source-graph.mjs)
- Document CSS: [public/document.css](public/document.css)

## Development

```bash
npm install
npm start
```

Run focused checks:

```bash
npm run test:blog-embed
npm run test:document-advisor
npm run test:source-graph
```

Build the VS Code extension:

```bash
cd vscode-extension
npm install
npm run build
npm run package:vsix
```
