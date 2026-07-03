---
name: markdown-ignore-advisor
description: Diagnose whether Markdown files or folders should be excluded through .mpsignore. Use when the user asks whether a document tree is noise for Source Graph, Markdown search, URL/link analysis, document graph quality, or agent grounding.
---

# Markdown Ignore Advisor

Use this skill when the user asks questions like:

- "Should this folder be excluded from Source Graph?"
- "Is this file noise for agents?"
- "What should go into `.mpsignore` for a Markdown workspace?"
- "Should these generated Markdown files affect URL/link relationship analysis?"

This skill does not edit `.mpsignore` automatically unless the user explicitly asks for a patch.

## Evidence Collection

Use `rg` or file listing first when the user asks about one obvious folder or exact pattern. Use Source Graph audit when deciding whether indexed Markdown is noisy, duplicated, orphaned, or harmful to document relationship analysis.

## Companion Skills

If ignore analysis uncovers broader corpus structure, overlapping pages, stale links, or an edit-impact question, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the workspace graph when recent edits matter:

```bash
node scripts/source-graph.mjs update --root .
```

2. Run the ignore audit:

```bash
node scripts/source-graph.mjs audit --root .
```

3. If the user asks about one candidate path, inspect nearby graph evidence:

```bash
node scripts/source-graph.mjs search --root . --query "folder-or-file-name" --limit 6 --include-links --links-depth 1 --include-headings
node scripts/source-graph.mjs related --root . --path "README.md" --limit 8 --include-headings
```

## Decision Rules

- Recommend ignore when content is mostly duplicate skill copies, bundled assets, test fixtures, drafts, scratch notes, or archived material.
- Be cautious with `docs/`, `README`, published guides, and user-authored knowledge pages.
- If a folder could be useful for maintenance but noisy for Markdown search, say that explicitly.
- Separate `high-confidence ignore`, `conditional ignore`, and `keep indexed`.

## Output Format

Prefer a table:

| Path or Pattern | Recommendation | Confidence | Why | Tradeoff |
| --- | --- | --- | --- | --- |

Close with either:
- a proposed `.mpsignore` patch, or
- a statement that no change is justified yet
