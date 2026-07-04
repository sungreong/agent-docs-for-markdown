---
name: markdown-link-repair
description: Find and prioritize broken or weak Markdown links, URL references, backlinks, and graph relationships. Use when the user wants to repair unresolved internal links, stale URLs, backlink gaps, or Source Graph quality problems before agents rely on the workspace.
---

# Markdown Link Repair

Use this skill when link quality matters more than writing new content. It is especially useful before asking an agent to summarize, update, or analyze Markdown documents, because unresolved links and stale URL references reduce grounding quality.

Use it for Markdown workspaces, docs folders, notes, exported pages, and any document graph where links carry meaning.

## Evidence Collection

Use `rg` for one-off literal URL or link text checks. Use Source Graph audit/neighbors when finding broken internal links, stale URL references, backlink gaps, or weak graph relationships across multiple documents.

## Companion Skills

If link repair reveals noisy folders, overlapping source pages, missing topic context, or documents that must be updated together, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the graph:

```bash
node scripts/source-graph.mjs update --root .
```

2. Run the audit to find unresolved internal links and noisy duplicate copies:

```bash
node scripts/source-graph.mjs audit --root .
```

3. Investigate specific pages or topics:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 8 --include-links --links-depth 1 --include-headings
node scripts/source-graph.mjs neighbors --root . --path "path/to/doc.md" --depth 1
```

## Repair Priorities

- Broken internal links that block navigation
- Pages with high importance but weak backlink structure
- Duplicate-copy links that should not be treated as document evidence
- Ambiguous references that need clearer path or title wording

## Output Format

Use a repair queue:

| Source | Problem | Severity | Evidence | Suggested fix |
| --- | --- | --- | --- | --- |

Be explicit when a “fix” should really be an ignore rule instead of a link edit.
