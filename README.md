# Markdown Pattern Studio

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Markdown%20Pattern%20Studio%20Preview-0078d4?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-pattern-studio-preview)

Markdown Pattern Studio is a Markdown-first renderer for polished reports, slide-style documents, blog-ready HTML, and VS Code-based document navigation.

For the full Korean guide, see [README.ko.md](README.ko.md).
For VS Code extension details, see [vscode-extension/README.md](vscode-extension/README.md) and [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md).
For release history, see [CHANGELOG.md](CHANGELOG.md).

## Highlights

- VS Code extension with MD Studio File Browser, preview, auto-refresh, outline navigation, and export commands.
- Source Graph webview for Markdown workspaces, backed by a local `.mps/source-graph.sqlite` index.
- Bundled AI skills that can be downloaded from VS Code and handed to Claude, Codex, or Agents for document writing.
- Browser studio with Markdown editing, live preview, templates, appearance controls, and HTML export.
- Export targets for standalone HTML, blog-safe embed HTML, and scoped content fragments.

## Screenshots

### VS Code Extension Updates

![Markdown Pattern Studio Preview 0.1.34 update highlights](assets/images/vscode-extension-0.1.34-updates.png)

### Source Graph Webview

![Markdown Pattern Studio Source Graph webview](assets/images/source-graph-vsix-preview.png)

### Browser Studio

![Markdown Pattern Studio web editor](assets/images/web.png)

### Standalone HTML Result

![Standalone Markdown Pattern Studio HTML result](assets/images/result.png)

## Recommended: Use The VS Code Extension

This is the easiest path for normal use. Install the extension, open a Markdown workspace, then preview, export, search, and download document-writing skills from inside VS Code.

Install from the Visual Studio Marketplace:

[Markdown Pattern Studio Preview](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-pattern-studio-preview)

Or from VS Code Quick Open:

```text
ext install datanewbie-labs.markdown-pattern-studio-preview
```

Current repository extension version: `0.1.34`.

Common VS Code flows:

- Open Markdown files in the MD Studio File Browser.
- Run `Markdown Studio: Open Preview` for a live preview.
- Run `MD Studio: Transform Markdown to Styled HTML` to export standalone, blog embed, or fragment HTML.
- Run `MD Studio: Open Source Graph` to inspect document links.
- Run `MD Studio: Download Skill Folder` to export/update AI writing skills.

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
- Source Graph and MCP skill: [ai_skills/codex/skills/source-graph-search/SKILL.md](ai_skills/codex/skills/source-graph-search/SKILL.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- CLI renderer: [scripts/md-to-html.mjs](scripts/md-to-html.mjs)
- Source Graph CLI/MCP server: [scripts/source-graph.mjs](scripts/source-graph.mjs)
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
