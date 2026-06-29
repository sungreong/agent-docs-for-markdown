# Changelog

Release notes and notable project changes are tracked here so the main README can stay focused.

## VS Code Extension 0.1.34 — 2026-06-24

- Improved body, muted context, link, and inline code contrast on dark/accent slides.
- Added post-render color/font contrast checks to the bundled document-generation skills.
- Added regression coverage for `.message .dark` and regular `.dark` slide contrast.
- Latest VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.34.vsix`

## VS Code Extension 0.1.33 — 2026-06-24

- Improved VS Code webview card and feature-grid title sizing/wrapping.
- Adjusted responsive card/column grids for narrow preview panels.
- Updated bundled skill guidance for safer short card labels and body text.
- Historical VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.33.vsix`

## VS Code Extension 0.1.32 — 2026-06-22

- Added Blog Embed HTML and Content Fragment export targets.
- Added `.html` / `.htm` viewer opening plus HTML source edit/refresh support.
- Added `mdStudioPreview.language` for English default UI and Korean labels.
- Added the bundled `document-production-advisor` skill.
- Added source-matched workspace skill root updates from `MD Studio: Download Skill Folder`.
- Historical VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.32.vsix`

## VS Code Extension 0.1.31 — 2026-06-20

- Added the Marketplace representative icon.
- Connected `assets/icon.png` through the extension `package.json` icon field.
- Included `assets/icon.png` in the VSIX package.
- Historical VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.31.vsix`

## VS Code Extension 0.1.30 — 2026-06-20

- Set the Marketplace publisher to `datanewbie-labs`.
- Updated repository, bugs, and homepage links to the GitHub repository.
- Updated install guidance for `datanewbie-labs.markdown-pattern-studio-preview`.
- Historical VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.30.vsix`

## VS Code Extension 0.1.20 — 2026-06-13

- Rendered inline `<small>...</small>` as safe caption HTML with inline Markdown support.
- Added `.studio-document small` styling to standalone HTML and VS Code bundled CSS.
- Strengthened CLI/renderer regression tests for raw HTML details and small text handling.
- Historical VSIX: `vscode-extension/markdown-pattern-studio-preview-0.1.20.vsix`

## VS Code Extension 0.1.19 — 2026-05-24

- Added shared `appearance` options across web, CLI, and VS Code Preview.
- Added the Style menu to standalone HTML.
- Added Slides `Fill` zoom and reset overflow state when switching between Stack and Slides.
- Added extra extension display, non-Markdown `Open in Editor`, folder FOCUS, and FOCUS clearing in MD Studio File Browser.
- Prioritized the bundled extension renderer for default CLI settings so newer viewer controls are present.
- Converted `<details>/<summary>` into static note callouts and added quality warnings for unsupported raw HTML.
- Updated `md-presentation-composer` guidance to avoid raw HTML and replace details blocks safely.

## v0.3.1 — 2026-05-01

- Added 8 palettes: `midnight`, `coral`, `terracotta`, `charcoal`, `teal-trust`, `berry`, `cherry`, and `sage`.
- Added typography scale tokens for PPT-style Markdown documents.
- Added `.dark`, `.half-bleed`, and `.icon-list` templates.
- Added `intent:` frontmatter and CLI `--intent`.
- Removed decorative section title underlines in slide mode.
- Standardized slide padding, alignment, and content spacing.
- Reworked `SKILL.md` around the Audit → Map → Commit → Verify workflow.
- Added item-count based template selection guidance and visual QA checklist references.
- Added `ai_skills/sync.sh` for Claude → Agents / Codex synchronization.
- Built `vscode-extension/markdown-pattern-studio-preview-0.1.8.vsix`.
