# Source Graph CLI Skill QA

This checklist verifies the path from a Markdown workspace to an agent using the Markdown workspace search skill and local CLI. It exists so document search is judged by observable answers, not by server registration.

## Acceptance Criteria

| ID | Outcome | Observable check |
| --- | --- | --- |
| AC-1 | The user can create the workspace graph DB. | `.mps/source-graph.sqlite` exists after `MD Studio: Initialize Source Graph Workspace` or `MD Studio: Update Source Graph Index`. |
| AC-2 | Agent skill roots are prepared without hand-editing config. | `MD Studio: Install or Export Skills` -> `Install bundled skills to this workspace` copies bundled skills into matching roots such as `.codex/skills`, `.agents/skills`, and `.claude/skills`. |
| AC-3 | The skill teaches CLI command execution. | `markdown-workspace-search/SKILL.md` tells agents to run `node scripts/source-graph.mjs update/search/related/neighbors` from the workspace root. |
| AC-4 | CLI command execution returns useful document context. | `search` returns paths, titles, snippets, scores, headings, and optional `linkedDocuments`/`links`. |
| AC-5 | Agent answers use evidence. | Answers include `Path`, `Title`, `Why it matters`, `Heading evidence`, `Link evidence`, and `Next action`, not only filenames. |
| AC-6 | Duplicate skill copies do not pollute normal answers. | `search` and `related` collapse `.codex`, `.agents`, and `ai_skills` duplicates by default; `--include-copies` exposes them only for sync audits. |

## Manual QA Flow

1. Open a Markdown workspace.
2. Run `MD Studio: Initialize Source Graph Workspace`.
3. Run `MD Studio: Install or Export Skills`, then choose `Install bundled skills to this workspace`.
4. Confirm `.mps/source-graph.sqlite` exists.
5. Confirm a matching installed copy such as `.codex/skills/markdown-workspace-search/SKILL.md`, `.agents/skills/markdown-workspace-search/SKILL.md`, or `.claude/skills/markdown-workspace-search/SKILL.md` exists and references `references/cli-commands.md`.
6. Ask the agent to use the Markdown Workspace Search skill for a document question.
7. Confirm it runs:

```bash
node scripts/source-graph.mjs update --root .
node scripts/source-graph.mjs search --root . --query "README" --limit 3 --include-links --links-depth 1 --include-headings
```

8. Ask for related reading:

```bash
node scripts/source-graph.mjs related --root . --path "README.md" --limit 5 --include-headings
```

9. Ask for backlinks and outbound links:

```bash
node scripts/source-graph.mjs neighbors --root . --path "README.md" --depth 1
```

10. Confirm the final answer uses `Why it matters`, `Heading evidence`, `Link evidence`, and `Next action`.

## Regression Coverage

- CLI `update`, `search`, `related`, and `neighbors`.
- `--include-links`, `--links-depth 1`, `--include-headings`, `--heading-limit`, and `--include-copies`.
- Skill copy sync across bundled and workspace agent skill roots.
- Source Graph launcher, search, graph DB creation, and source ignore behavior.
- It is not a code symbol graph. Use codegraph for code symbols and call paths.
