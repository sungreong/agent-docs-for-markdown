---
name: markdown-workspace-search
description: Search and orient within Markdown workspaces. Use when the user asks about Markdown sources, document contents, related notes, backlinks, citations, headings, URL references, or where information lives; choose fast raw search such as rg for simple exact/file discovery, and Source Graph when relationships, linked documents, backlinks, headings, related context, or update impact matter.
---

# Markdown Workspace Search

Use this skill to choose the right Markdown discovery path. It may use `rg` for simple exact/file discovery, then Source Graph when the answer needs document relationships, headings, links, backlinks, or related-document evidence.

This skill does not require server registration. Treat the CLI as the stable interface so it works independently in each workspace. Prefer the workspace `node scripts/source-graph.mjs` when it exists; otherwise run this skill's bundled `scripts/source-graph.mjs`, which falls back to a portable Markdown scanner.

## OS-Aware Execution

Detect the shell before writing commands. On Windows PowerShell, do not use Unix helpers such as `tail`, `grep`, `find`, or `2>&1 | tail`; use plain `node ...` commands and PowerShell tools such as `Select-Object -Last 20` only when needed. On macOS/Linux shells, POSIX helpers are fine, but the Node commands below work without them.

Use forward slashes in Node script paths when possible; Node accepts them on Windows and POSIX. Quote paths that contain spaces.

## Node Requirement

This skill requires a working `node` executable because both the workspace CLI and bundled portable scanner are Node scripts. Before the first command, verify Node if the environment is new or the previous run failed with `node: command not found`, `node is not recognized`, or an equivalent PATH error.

If Node is missing, do not retry graph commands or fall back to broad `rg` by default. Use `install-diagnostics` first, diagnose the OS and PATH state, then ask for approval before any install or global configuration. Typical install choices are:

- Windows: `winget install OpenJS.NodeJS.LTS`
- Ubuntu/Linux/WSL: `sudo apt-get update && sudo apt-get install -y nodejs npm`
- macOS: `brew install node`

After install or PATH changes, verify with `node --version` and rerun the Source Graph command. If the user declines Node installation, explain that graph search is blocked and use `rg` only as a degraded fallback without link/backlink/related-document evidence.

## Tool Choice Rule

Classify the user request before running commands.

Use `rg` first when the user needs:

- exact raw text occurrences;
- a quick list of files mentioning a term;
- filename/path discovery;
- a small line-level check inside one known file;
- non-Markdown files or content outside the Source Graph index.

Use Source Graph when the user needs:

- linked documents, backlinks, outbound links, or URL/reference relationships;
- related documents beyond exact keyword hits;
- headings/snippets for answer grounding;
- document hubs, orphan/noisy documents, duplicate copies, or corpus structure;
- update impact, canonical-source choice, context packaging, or link repair.

The best flow is often hybrid: use `rg -l` to find a fast seed, then run `neighbors` or `related` on the best Markdown path. Do not run Source Graph just to prove a simple exact match if `rg` already answers the question.

## Large Output Rule

Do not rerun the same search just because the terminal reports `Output too large` or saves a persisted output file. Read the saved file directly with the environment's file-read tool or a native shell command.

- Windows PowerShell: use `Get-Content -LiteralPath "C:\path\to\result.json" -Raw` or pass the path through an environment variable before parsing with Node.
- macOS/Linux shell: use `cat "/path/to/result.json"` or `node -e '...'` with the path as an argument.
- Avoid embedding Windows backslash paths directly inside `node -e` strings; sequences like `\t` and `\b` can corrupt the path.
- If the first query may be large, prefer `--compact --heading-limit 5 --limit 10`, or write to a known file with `--output .mps/search-results.json`.

## Companion Skills

If search reveals corpus noise, overlapping pages, stale links, or an edit-impact question, read `references/markdown-graph-skill-map.md` and continue with the matching Markdown graph skill instead of forcing every task through search.

## Preferred Workflow

1. From the workspace root, make sure the index exists or is fresh enough. Prefer the workspace CLI:

```bash
node scripts/source-graph.mjs update --root .
```

If that file is missing, use the bundled skill script path for the active agent root, for example:

Windows PowerShell:

```powershell
node .codex/skills/markdown-workspace-search/scripts/source-graph.mjs update --root .
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "topic" --limit 10 --compact --heading-limit 5
node .agents/skills/markdown-workspace-search/scripts/source-graph.mjs audit --root .
```

macOS/Linux shell:

```bash
node .codex/skills/markdown-workspace-search/scripts/source-graph.mjs update --root .
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "topic" --limit 10 --compact --heading-limit 5
node .agents/skills/markdown-workspace-search/scripts/source-graph.mjs audit --root .
```

2. For simple exact/file discovery, use `rg` first:

```bash
rg -n -i "topic|alternate term" -g "*.md" .
rg -l -i "topic|alternate term" -g "*.md" .
```

3. For topic exploration where relationships may matter, start compact:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 10 --compact --heading-limit 5
```

4. Expand only the best seed documents with graph context:

```bash
node scripts/source-graph.mjs search --root . --query "topic" --limit 5 --include-links --links-depth 1 --include-headings --heading-limit 8
```

5. For "what else should I read", "related docs", or follow-up discovery, use related:

```bash
node scripts/source-graph.mjs related --root . --path "README.md" --limit 8 --include-headings
node scripts/source-graph.mjs related --root . --query "topic" --limit 8 --include-headings
```

6. For backlinks, outbound links, and why two documents are connected, use neighbors:

```bash
node scripts/source-graph.mjs neighbors --root . --path "README.md" --depth 1
```

7. If a user asks about recent edits, run `update` before Source Graph commands. If graph results are weak, use `rg` to find a better seed and then return to `related` or `neighbors`.

## Command Choice

- `update`: rebuild `.mps/source-graph.sqlite` after Markdown changes or before high-confidence audits.
- `search`: find documents by title, path, body text, or phrase. Start compact with `--compact --heading-limit 5`; add `--include-links --links-depth 1 --include-headings` when surrounding document context is needed.
- `related`: rank nearby documents from a seed `--path`, `--id`, or `--query` using links, backlinks, and shared terms.
- `neighbors`: return inbound and outbound graph neighbors plus the link records that justify the relationship.
- `--include-headings`: include section titles, depth, line, and slug so answers can cite document structure.
- `--heading-limit <number>`: cap headings per document. Use `5` for first-pass searches.
- `--compact`: return a smaller result shape for first-pass search and large workspaces.
- `--output <path>`: write JSON to a known file and print only the saved path metadata.
- `--include-copies`: expose duplicate skill copies from `.codex`, `.agents`, `.claude`, and `ai_skills`; leave it off unless auditing skill sync. The portable fallback excludes those skill folders by default so normal document searches are not dominated by installed skill docs.

## Result Quality Notes

- Search and related results exclude local skill-copy folders by default. Add `--include-copies` only when auditing the skill bundle, install sync, or agent-skill docs themselves.
- Treat this as document intelligence, not code intelligence: it is good at Markdown paths, headings, snippets, links, backlinks, and related-document discovery. Use codegraph for code symbols and call paths.
- Use `Heading evidence` for returned section titles/slugs/lines. Use `Link evidence` for `linkedDocuments`, inbound/outbound links, link labels, status, and line numbers.
- Avoid answering with only paths; the result should be not a flat filename list. Explain why each document matters and what the user should do next.
- If workspace `scripts/source-graph.mjs` is missing, run the bundled skill script instead. It will use a portable Markdown scanner and note that full SQLite-backed Source Graph is unavailable.

## Response Pattern

For search and discovery answers, prefer a compact table:

| Path | Title | Why it matters | Heading evidence | Link evidence | Next action |
| --- | --- | --- | --- | --- | --- |

Mention whether you refreshed the index. If the graph evidence is weak, say so plainly and suggest the next query or seed document.

See `references/cli-commands.md` for command examples and JSON result interpretation.
