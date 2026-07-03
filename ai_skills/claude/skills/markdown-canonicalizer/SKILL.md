---
name: markdown-canonicalizer
description: Recommend which Markdown page should be treated as the canonical source for a topic, URL, or repeated concept. Use when multiple Markdown pages overlap and the user wants merge, archive, redirect, dedupe, or keep-separate guidance.
---

# Markdown Canonicalizer

Use this skill when the workspace has duplicate or overlapping Markdown pages and an agent needs to recommend a canonical source without silently rewriting structure.

Use it for docs, notes, generated Markdown, exported pages, URL reference pages, and any `.md` corpus where one source should be treated as primary.

## Evidence Collection

Use `rg` to find candidate pages when the overlap is just a phrase or title. Use Source Graph search/related/neighbors to compare canonical strength, backlinks, headings, hub role, and duplicate/noisy copies before recommending a source of truth.

## Companion Skills

If canonical review depends on noisy folders, missing context, edit impact, or broken links, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the graph if needed:

```bash
node scripts/source-graph.mjs update --root .
```

2. Audit the corpus for duplicate-copy noise:

```bash
node scripts/source-graph.mjs audit --root .
```

3. Search the topic and compare candidates:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 10 --include-links --links-depth 1 --include-headings
node scripts/source-graph.mjs related --root . --query "topic" --limit 8 --include-headings
```

## Canonical Decision Rules

- Prefer pages with stronger backlinks, clearer titles, and broader topic fit.
- Penalize draft pages, archived pages, test fixtures, and duplicate skill copies.
- If two pages serve different audiences or scopes, recommend keeping both and clarifying titles.
- Never auto-archive or auto-delete without user approval.

## Output Format

Use a recommendation table:

| Candidate | Role | Why | Evidence | Action |
| --- | --- | --- | --- | --- |

Valid actions:
- `canonical`
- `merge into canonical`
- `keep separate`
- `archive later`
- `needs human choice`
