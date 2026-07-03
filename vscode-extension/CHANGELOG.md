# Changelog

## 0.1.34 - 2026-06-24

- Improved dark/accent slide contrast so body, muted, link, and inline-code text stay readable on dark backgrounds.
- Added a post-render color/font contrast harness to bundled document-writing skills so weak text/background pairings are revised before delivery.
- Added regression coverage for `.message .dark` and plain `.dark` slide rendering.

## 0.1.33 - 2026-06-24

- Improved card and feature-grid typography so long labels no longer render as oversized, awkwardly broken headings in VS Code webviews.
- Made column/card grids responsive in the bundled preview and narrow-panel webview overrides.
- Updated bundled document-writing skills to prefer compact card labels with body text and to avoid brittle heading-only cards.

## 0.1.32 - 2026-06-22

- Added HTML export target selection for Standalone HTML, Blog Embed HTML, and Content Fragment.
- Added Blog Embed output for existing site editors with scoped CSS, no fixed viewer chrome, and stack-first paginated content.
- Added CLI support for `--export-target standalone|blog-embed|fragment`.
- Changed Agent Docs File Browser prompts, sort/filter labels, folder summaries, and generated template defaults to English by default.
- Added `markdownAgentDocs.language` so Korean extension labels can be enabled explicitly with `"ko"`.
- Open exported `.html` and `.htm` files directly in the Agent Docs Viewer from the File Browser.
- Keep Edit Source, Refresh, and save-triggered preview updates available for HTML Viewer sessions.
- Fixed Edit Source fallback from Webview toolbar buttons so the current Markdown/HTML preview opens its original source file.
- Added document expression utilities: safe zone, problem statement, big-number hero, feature grid, metrics dashboard, contrast pair, gradient numbers, oversized text, and screenshot shadows.
- Added bundled `document-production-advisor` skill for request-contract tracing, render UX verification, HTML/blog/DOCX/PPTX-style handoff planning, and an in-extension render smoke-test example; updated `md-presentation-composer` with request tracing, expression utility, and DOCX handoff rules.
- Enhanced `Agent Docs: Install or Export Skills` so it can either save a selected skill as ZIP or update selected/all skills into the workspace root that matches the chosen source: Claude -> `.claude/skills`, Agents -> `.agents/skills`, Codex -> `.codex/skills`, workspace source -> `markdownAgentDocs.skillsDir`.

## 0.1.31 - 2026-06-20

- Added a Marketplace icon to the extension manifest.
- Packaged the icon as `assets/icon.png`.

## 0.1.30 - 2026-06-20

- Set the Marketplace publisher to `datanewbie-labs`.
- Updated repository, issues, and homepage metadata to the public GitHub repository.
- Refreshed install and cleanup docs for the published extension ID.

## 0.1.20 - 2026-06-13

- Added safe inline `<small>` rendering with nested Markdown inline formatting.
- Synced the bundled VS Code renderer with the web renderer.
- Added regression coverage for raw HTML details and small text rendering.

## 0.1.19 - 2026-05-24

- Added shared appearance controls for VS Code Preview and HTML export.
- Added Fill zoom for Slides mode.
- Expanded Agent Docs File Browser with extra extensions, focus mode, and non-Markdown editor opening.
- Preserved unsupported raw HTML as quality warnings or static callouts.
