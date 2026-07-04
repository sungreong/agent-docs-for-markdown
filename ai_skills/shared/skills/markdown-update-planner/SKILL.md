---
name: markdown-update-planner
description: Plan which Markdown documents should be updated together. Use when the user wants to change one page, topic, URL reference, or linked document set and needs a grounded impact plan so the document graph does not drift out of sync.
---

# Markdown Update Planner

Use this skill before editing an existing Markdown page or related document set. It helps prevent the common failure mode where one page changes but related pages, backlinks, URL references, and reference pages stay stale.

Use it whenever a Markdown edit may affect linked pages, citations, backlinks, URL references, or Source Graph neighbors.

## Evidence Collection

Use `rg` only to confirm the target page or exact term quickly. Use Source Graph neighbors/related for the actual impact plan, because update risk depends on links, backlinks, related pages, and shared context rather than raw mentions alone.

## Companion Skills

If planning reveals missing context, noisy search results, overlapping source pages, or broken links, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the graph if recent edits matter:

```bash
node scripts/source-graph.mjs update --root .
```

2. Confirm the target page:

```bash
node scripts/source-graph.mjs search --root . --query "target topic" --limit 8 --include-links --links-depth 1 --include-headings
```

3. Expand the impact set:

```bash
node scripts/source-graph.mjs neighbors --root . --path "path/to/doc.md" --depth 1
node scripts/source-graph.mjs related --root . --path "path/to/doc.md" --limit 10 --include-headings
```

4. If the workspace looks noisy, run triage first:

```bash
node scripts/source-graph.mjs audit --root .
```

## Plan Categories

- `Must Update`: directly linked or clearly contradictory pages
- `Review`: likely affected context pages that may need wording changes
- `Do Not Touch Yet`: low-confidence related pages or noisy copies

## Output Format

Use a short plan:

| Path | Category | Why | Evidence | Recommended action |
| --- | --- | --- | --- | --- |

Close with:
- primary edit target
- sync-review set
- blockers or ambiguity
