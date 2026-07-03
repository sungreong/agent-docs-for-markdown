---
name: markdown-context-packager
description: Package the minimum grounded context an agent should read before writing, updating, or analyzing Markdown documents. Use when the user wants a topic bundle, related docs, headings, backlinks, URL/link evidence, and conflict candidates instead of raw search results.
---

# Markdown Context Packager

Use this skill to turn a topic, URL, link, or target document into an agent-ready context bundle. The goal is to reduce repeated searching and keep edits or analysis grounded in the existing Markdown document graph.

Use it for Markdown workspaces, docs folders, note collections, exported pages, and any `.md` corpus where relationships matter.

## Evidence Collection

Use `rg -l` first when the topic is just a keyword and no seed document is known. Use Source Graph search/related/neighbors after a seed exists or when the bundle must include headings, backlinks, URL references, related docs, or sync risks.

## Companion Skills

If packaging reveals noisy folders, overlapping pages, stale links, or documents that must be updated together, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the graph if needed:

```bash
node scripts/source-graph.mjs update --root .
```

2. Find the best seed document:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 8 --include-links --links-depth 1 --include-headings
```

3. Expand the seed with related and neighbor evidence:

```bash
node scripts/source-graph.mjs related --root . --path "path/to/doc.md" --limit 8 --include-headings
node scripts/source-graph.mjs neighbors --root . --path "path/to/doc.md" --depth 1
```

## Package Contents

- Target document
- Why it is the seed
- Key headings to read first
- Related documents to consult
- Backlinks or neighbors that may need synchronized edits
- Known unresolved links or graph weak spots if they affect confidence

## Output Format

Use a compact bundle:

```text
Target:
Why this seed:
Read first:
- path | heading evidence | why

Related:
- path | reason | next use

Sync risks:
- path | why it might conflict
```

Do not dump long raw excerpts. Package only the smallest grounded set that another agent should read next.
