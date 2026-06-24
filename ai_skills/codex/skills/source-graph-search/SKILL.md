---
name: source-graph-search
description: Search and navigate Markdown Pattern Studio source graphs through MCP or the local CLI. Use when the user asks Codex to find related Markdown documents, trace document links/citations/backlinks, refresh the source graph after document or code-block edits, or use the VS Code extension's Source Graph index.
---

# Source Graph Search

Use the Markdown Pattern Studio source graph before manually grepping large Markdown collections. The graph index lives at `.mps/source-graph.json` and stores document, heading, link, citation, search-index, node, and edge tables.

## Preferred Workflow

1. If MCP tools named `source_graph_update`, `source_graph_search`, `source_graph_neighbors`, or `source_graph_related` are available, use them first.
2. If MCP is not available, run the local CLI from the workspace root:

```bash
node scripts/source-graph.mjs update --root .
node scripts/source-graph.mjs search --root . --query "topic"
node scripts/source-graph.mjs related --root . --path "README.md"
node scripts/source-graph.mjs neighbors --root . --path "README.md"
```

3. When the user asks about changes after editing Markdown, update the graph first. MCP auto-refreshes stale indexes, but explicit `source_graph_update` is clearer before answering change-sensitive questions.
4. Use `related` for discovery, `neighbors` for link/backlink context, and `search` for text/title/path lookup.
5. Answer with the document paths, why they are relevant, and the specific link/search evidence used.

## Tool Choice

- `source_graph_search`: topic, title, path, phrase, or keyword search.
- `source_graph_related`: "find related docs", "what else should I read", "similar source docs", or discovery from a seed document.
- `source_graph_neighbors`: inbound/outbound link graph for a specific document.
- `source_graph_update`: force a rebuild after file changes, before audits, or when counts look stale.

## Codex MCP Setup

In VS Code, run `MD Studio: Copy Codex Source Graph MCP Config`, paste the copied snippet into Codex `config.toml`, then restart Codex. If that command is unavailable, use this pattern and adjust paths:

```toml
[mcp_servers.markdown_pattern_studio_source_graph]
command = "node"
args = ["C:\\path\\to\\markdown-pattern-studio\\scripts\\source-graph.mjs", "mcp", "--root", "C:\\path\\to\\workspace"]
```

## Response Pattern

For search/discovery answers:

- Start with the best matching documents.
- Include paths and relation type: search hit, outbound link, inbound link, or shared terms.
- Mention when the index was updated if the question depends on recent edits.
- If results are weak, say so and suggest the next query or seed document.
