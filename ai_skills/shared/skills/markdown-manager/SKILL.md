---
name: markdown-manager
description: Unified Markdown workspace manager for Agent Docs Source Graph. Use when the user asks any Markdown corpus, search, graph, link, ignore, context, canonical-source, update-planning, report, deck, export, or setup question and wants the agent to choose the right internal Markdown workflow instead of picking many separate skills.
---

# Markdown Manager

Use this as the default entry point for Agent Docs for Markdown work. It routes natural-language requests to the right internal workflow so users do not need to remember every separate Markdown skill.

Start by naming the route you chose in one short sentence, for example: "I'll handle this as link repair plus update planning." Then do the work with the smallest set of tools and context needed.

## Routing

| User intent | Internal workflow to apply |
| --- | --- |
| Find what the Markdown workspace says, locate sources, headings, backlinks, URLs, or related notes | `markdown-workspace-search` |
| Audit the whole corpus, entry points, orphans, noisy folders, duplicate skill copies, weak graph areas | `markdown-graph-triage` |
| Decide what should be excluded from Source Graph or `.mps/.mpsignore` | `markdown-ignore-advisor` |
| Package the minimum docs an agent should read before writing or analysis | `markdown-context-packager` |
| Plan which documents should be updated together before edits | `markdown-update-planner` |
| Choose the canonical Markdown page among overlapping pages | `markdown-canonicalizer` |
| Repair broken internal links, stale URLs, unresolved references, or backlink gaps | `markdown-link-repair` |
| Turn Markdown into a report, pitch, tutorial, or presentation-style document | `md-presentation-composer` |
| Convert Markdown pages into a slide/deck plan or PPTX-ready structure | `md-to-deck-designer` |
| Check export readiness for standalone HTML, blog embed HTML, DOCX, or document handoff | `document-production-advisor` |
| Diagnose missing Node, npm, CLI, PATH, Python, or local setup | `install-diagnostics` |

## Decision Rules

- Use one primary route by default. Combine two only when the user clearly needs both, such as context packaging plus update planning.
- For simple exact text or filename discovery, use `rg` first.
- Use Source Graph when the answer depends on links, backlinks, related docs, headings, broken links, URL references, update impact, or corpus health.
- Do not assume the user's workspace contains `scripts/source-graph.mjs`. Many installed workspaces only have this skill folder.
- Prefer this skill's bundled script: `node .codex/skills/markdown-manager/scripts/source-graph.mjs`, `node .claude/skills/markdown-manager/scripts/source-graph.mjs`, `node .agents/skills/markdown-manager/scripts/source-graph.mjs`, `node .gemini/skills/markdown-manager/scripts/source-graph.mjs`, or `node .cursor/skills/markdown-manager/scripts/source-graph.mjs`, depending on the active agent folder.
- The bundled script is OS-aware and runs on Windows, macOS, and Linux. It delegates to a workspace `scripts/source-graph.mjs` only when one actually exists; otherwise it uses a portable Markdown scanner.
- If a narrower skill is installed in the current agent, follow it after choosing the route. If it is not installed, use the routing table and command patterns in this manager.
- Do not load every Markdown workflow. Pick the route, gather evidence, answer with paths and next actions.

## Common Commands

Use the installed `markdown-manager` script path for your current agent folder. Examples below use `.codex`; replace it with `.claude`, `.agents`, `.gemini`, or `.cursor` when that is where the skill is installed.

Refresh the local graph:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs update --root .
```

Search with compact evidence:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs search --root . --query "topic" --limit 10 --compact --heading-limit 5
```

Search with links and headings:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs search --root . --query "topic" --limit 5 --include-links --links-depth 1 --include-headings --heading-limit 8
```

Find related documents:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs related --root . --path "README.md" --limit 8 --include-headings
```

Inspect direct neighbors:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs neighbors --root . --path "README.md" --depth 1
```

Audit the workspace:

```bash
node .codex/skills/markdown-manager/scripts/source-graph.mjs audit --root .
```

If none of the agent skill paths exists, use `rg` as a degraded fallback for exact text discovery and tell the user the bundled skill script is missing.

## Example User Requests

- "문서 내 링크가 안 맞는지 확인해줘" -> route to `markdown-link-repair`.
- "이 주제로 작업하기 전에 어떤 문서를 읽어야 해?" -> route to `markdown-context-packager`.
- "이 문서를 고치면 같이 봐야 할 파일 알려줘" -> route to `markdown-update-planner`.
- "이 폴더 `.mpsignore`에 넣어도 돼?" -> route to `markdown-ignore-advisor`.
- "비슷한 문서 중 기준 문서를 골라줘" -> route to `markdown-canonicalizer`.
- "이 리서치 노트를 보고서 형태로 바꿔줘" -> route to `md-presentation-composer` and optionally `document-production-advisor`.

## Response Pattern

Return concise, evidence-backed results:

| Path | Why it matters | Evidence | Next action |
| --- | --- | --- | --- |

For planning tasks, include the selected internal workflow, files to read or edit, risks, and a short recommended sequence. For cleanup tasks, separate safe automatic candidates from items that need human review.
