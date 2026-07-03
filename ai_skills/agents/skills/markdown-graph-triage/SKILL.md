---
name: markdown-graph-triage
description: Audit a Markdown workspace or document graph. Use when the user asks about Markdown files, URL/link relationships, related docs, corpus noise, entry points, orphan docs, duplicate skill noise, or weak Source Graph structure for document analysis.
---

# Markdown Workspace Triage

Use this skill before asking an agent to analyze, write, restructure, or curate Markdown documents. The goal is to classify the workspace into high-signal document content, low-signal support content, duplicate skill copies, URL/link relationship evidence, and weak graph areas.

Use this skill when the user asks about `.md` files, Markdown sources, document relationships, backlinks, citations, URLs, link structure, or Source Graph quality.

This skill treats `node scripts/source-graph.mjs` as the stable interface.

## Evidence Collection

Do not run Source Graph for every Markdown question. Use `rg` for quick exact/path discovery, especially when the user only asks “which files mention X?” Use Source Graph audit/search/related/neighbors when the user asks about corpus structure, noisy folders, entry points, orphan docs, backlinks, unresolved links, or relationship quality.

## Companion Skills

If the audit points to ignore rules, context packaging, edit impact, canonical-source choice, or link repair, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill.

## Required Workflow

1. Refresh the graph if the workspace changed recently:

```bash
node scripts/source-graph.mjs update --root .
```

2. Run the workspace audit:

```bash
node scripts/source-graph.mjs audit --root .
```

3. If the user asks about a specific topic, follow the audit with targeted discovery:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 8 --include-links --links-depth 1 --include-headings
node scripts/source-graph.mjs related --root . --query "topic" --limit 8 --include-headings
```

## What To Report

- Recommended `.mpsignore` candidates and why they are noisy.
- Entry documents that look like good document-graph seeds.
- Orphan or weakly connected documents.
- Duplicate skill-copy groups that should not be confused with user-authored Markdown sources.
- Unresolved internal links that will hurt agent grounding.

Do not silently decide that a document is non-canonical. Recommend, do not enforce.

## Response Pattern

Use compact sections:

1. `Corpus Risk`
2. `Keep Indexed`
3. `Ignore Candidates`
4. `Weak Structure`
5. `Next Action`

For ignore suggestions, explain the tradeoff:
- good to ignore for Markdown graph search
- keep indexed if the user is auditing skills, fixtures, or extension bundle content
