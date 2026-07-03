# Markdown Graph Skill Map

Use this reference when a Markdown graph task expands beyond the current skill. The skills work best as a small toolkit around `node scripts/source-graph.mjs`: search for evidence, audit the corpus, package context, plan edits, choose canonical sources, and repair links.

Prefer the workspace `node scripts/source-graph.mjs` when it exists. If the workspace does not include that CLI, run the current skill's bundled `scripts/source-graph.mjs`; it delegates to the workspace CLI when available and otherwise uses a portable Markdown scanner.

Use OS-neutral Node commands by default. On Windows PowerShell, avoid POSIX-only helpers like `tail`, `grep`, and `find`; on macOS/Linux they are acceptable but not required. The bundled scripts emit runtime information in portable fallback JSON so the agent can report which path it used. Portable fallback excludes local skill folders by default; add `--include-copies` only when auditing skill installation or bundle sync.

If `node` is missing or not on `PATH`, stop retrying graph commands and use `install-diagnostics` before falling back to raw text search. Ask for approval before installing Node. Typical commands are `winget install OpenJS.NodeJS.LTS` on Windows, `sudo apt-get update && sudo apt-get install -y nodejs npm` on Ubuntu/Linux/WSL, and `brew install node` on macOS. Verify with `node --version` after any install or PATH change.

When a search result is too large and the terminal persists it to a file, read that persisted file instead of rerunning the same command. For first-pass discovery in large workspaces, use `--compact --heading-limit 5` or `--output .mps/<topic>-search.json`.

Choose the lightest discovery tool that answers the actual question. Use `rg` for exact raw text, quick file lists, filename/path discovery, non-Markdown files, or line-level verification. Use Source Graph when the answer needs ranked Markdown context, headings, snippets, backlinks, outbound links, related documents, URL/reference relationships, update impact, or graph-quality evidence. A good hybrid flow is `rg -l` to find a seed, then Source Graph `neighbors` or `related` on the best Markdown path. Search and related exclude local skill-copy folders by default; add `--include-copies` only when auditing bundled skills or agent-skill docs.

| User intent | Prefer this skill | Why |
| --- | --- | --- |
| "Find exact mentions", "which files contain this string?", "quickly locate a path" | `markdown-workspace-search` | Use `rg` first for exact/file discovery, then Source Graph only if relationships or context are needed. |
| "Find where this is documented", "show related notes", "how are these docs connected?" | `markdown-workspace-search` | Use Source Graph for headings, backlinks, citations, and related-document evidence. |
| "What is in this Markdown corpus?", "which folders are noise?", "why are results messy?" | `markdown-graph-triage` | Reviews the whole document graph before deeper analysis or cleanup. |
| "Should this folder be ignored?", "what should go in .mpsignore?" | `markdown-ignore-advisor` | Converts audit findings into keep/ignore recommendations with tradeoffs. |
| "Give me the docs I should read before editing", "package context for this topic or URL" | `markdown-context-packager` | Builds the smallest useful bundle of seed docs, related docs, headings, and sync risks. |
| "If I edit this document, what else changes?", "plan the related-doc update" | `markdown-update-planner` | Uses neighbors and related docs to identify must-review and do-not-touch sets. |
| "These pages overlap", "which document should be the source of truth?" | `markdown-canonicalizer` | Compares candidate pages and recommends canonical, merge, archive, or keep-separate actions. |
| "Fix broken links", "stale URL references", "weak backlinks" | `markdown-link-repair` | Prioritizes unresolved links, stale URL references, backlink gaps, and graph-quality fixes. |

## Handoff Rules

- Start with `markdown-workspace-search` when the user only needs evidence or locations.
- Start with `markdown-graph-triage` when the workspace may be noisy or the user asks about overall structure.
- Use `markdown-ignore-advisor` before trusting search results if skill copies, tests, generated docs, or drafts dominate the graph.
- Use `markdown-context-packager` before writing, summarizing, or handing a focused topic to another agent.
- Use `markdown-update-planner` before editing existing Markdown that may have linked or related dependents.
- Use `markdown-canonicalizer` before merging, archiving, renaming, or treating one page as primary.
- Use `markdown-link-repair` when the graph itself is the problem: broken internal links, stale URL references, or missing backlinks.

## Shared Evidence Standard

Do not force every Markdown question through Source Graph. For simple exact-match requests, a short `rg` result can be the best answer. For relationship answers, include paths, titles, heading evidence, link evidence, and the next action. If graph evidence is weak, say what is missing and which command or skill should run next.
