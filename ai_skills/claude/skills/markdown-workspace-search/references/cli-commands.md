# Markdown Workspace Search CLI Commands

The stable agent interface is the local CLI. Prefer the workspace CLI when it exists:

```bash
node scripts/source-graph.mjs update --root .
node scripts/source-graph.mjs search --root . --query "README" --limit 3 --compact --heading-limit 5
node scripts/source-graph.mjs related --root . --path "README.md" --limit 5 --include-headings
node scripts/source-graph.mjs neighbors --root . --path "README.md" --depth 1
```

## Tool Choice

Use the lightest tool that answers the user's actual question.

Use `rg` for exact raw text, quick file lists, filename/path discovery, non-Markdown files, or line-level verification:

```bash
rg -n -i "topic|alternate term" -g "*.md" .
rg -l -i "topic|alternate term" -g "*.md" .
```

Use Source Graph when the answer needs ranked Markdown context, headings, snippets, backlinks, outbound links, related documents, URL/reference relationships, update impact, or graph-quality evidence.

Hybrid pattern:

```bash
rg -l -i "topic|alternate term" wiki docs processed -g "*.md"
node scripts/source-graph.mjs neighbors --root . --path "best/seed.md" --depth 1
node scripts/source-graph.mjs related --root . --path "best/seed.md" --limit 8 --include-headings
```

If `scripts/source-graph.mjs` is missing, use the bundled script from the active skill root. It first tries to delegate to the workspace CLI; if none exists, it scans Markdown files directly with a portable fallback:

Windows PowerShell:

```powershell
node .codex/skills/markdown-workspace-search/scripts/source-graph.mjs update --root .
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "README" --limit 3 --compact --heading-limit 5
node .agents/skills/markdown-workspace-search/scripts/source-graph.mjs audit --root .
```

macOS/Linux shell:

```bash
node .codex/skills/markdown-workspace-search/scripts/source-graph.mjs update --root .
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "README" --limit 3 --compact --heading-limit 5
node .agents/skills/markdown-workspace-search/scripts/source-graph.mjs audit --root .
```

Avoid OS-specific pipes unless they are needed. For example, use `node ...` directly on every OS; if you need to trim output, use `Select-Object -Last 20` in PowerShell and `tail -20` in POSIX shells.

## Missing Node

All commands in this reference require `node`. If a command fails because Node is missing or not on `PATH`, stop retrying Source Graph commands and use `install-diagnostics` to verify the OS, PATH, prior install history, and safe install choices.

Typical choices after user approval:

- Windows: `winget install OpenJS.NodeJS.LTS`
- Ubuntu/Linux/WSL: `sudo apt-get update && sudo apt-get install -y nodejs npm`
- macOS: `brew install node`

After any approved install or PATH change, verify with `node --version`. If the user declines installing Node, report that Source Graph is unavailable and use raw text search only as a degraded fallback without headings, backlinks, or related-document ranking.

## Large Output Handling

If the tool says output was persisted to a file, do not rerun the same search. Read that file directly.

Windows PowerShell:

```powershell
Get-Content -LiteralPath "C:\path\to\result.json" -Raw
$env:RESULT_JSON = "C:\path\to\result.json"
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.env.RESULT_JSON,'utf8')); console.log(data.map(d => `${d.score} ${d.path}`).join('\n'))"
```

macOS/Linux shell:

```bash
cat "/path/to/result.json"
node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(data.map(d => `${d.score} ${d.path}`).join("\n"))' "/path/to/result.json"
```

For large first-pass searches, prefer:

```bash
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "topic" --limit 10 --compact --heading-limit 5
node .claude/skills/markdown-workspace-search/scripts/source-graph.mjs search --root . --query "topic" --output .mps/topic-search.json
```

## Commands

- `update`: rebuild `.mps/source-graph.sqlite` with the workspace CLI, or `.mps/source-graph-portable.json` with the bundled portable fallback.
- `search`: search document title, path, and body text. Use when relationship context may matter, or after `rg` finds too many hits. Use `--compact --heading-limit 5` first on large workspaces. Use `--include-links --links-depth 1` when an agent needs nearby link/backlink context.
- `related`: rank related documents from a seed `--path`, `--id`, or `--query` using links, backlinks, and shared terms. Add `--include-headings` when choosing what to read next needs section-level context.
- `neighbors`: return inbound/outbound graph neighbors and link records for a seed `--path` or `--id`.

## Options

- `--limit <number>`: cap returned documents.
- `--include-links`: attach nearby linked documents to search results.
- `--links-depth <1-3>`: graph neighborhood depth for linked context.
- `--include-headings`: attach heading outlines with title, depth, line, and slug.
- `--heading-limit <number>`: cap headings per document.
- `--compact`: return smaller search/related rows for first-pass searches.
- `--output <path>`: write JSON to a known file and print the saved path metadata.
- `--include-copies`: include duplicate skill copies from `.codex`, `.agents`, `.claude`, and `ai_skills`; leave this off for normal user answers. Workspace CLI search/related and portable fallback exclude these folders by default.

## Answer Contract

Use a compact table with these columns when results are non-trivial:

| Path | Title | Why it matters | Heading evidence | Link evidence | Next action |
| --- | --- | --- | --- | --- | --- |

Avoid answering with only paths. If the graph evidence is weak, say so and run a narrower CLI query or choose a better seed document.

When the portable fallback is active, say so. It is good enough for Markdown paths, headings, links, backlinks, related docs, and URL references. It excludes local skill copies by default, but the full workspace CLI has richer SQLite-backed ranking and duplicate-copy handling.
