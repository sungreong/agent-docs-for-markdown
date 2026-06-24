# Source Graph MCP Tools

The MCP server is started by:

```bash
node scripts/source-graph.mjs mcp --root <workspace>
```

Available tools:

- `source_graph_update`: rebuild `.mps/source-graph.json`.
- `source_graph_search`: search document title, path, and content.
- `source_graph_related`: rank related documents from a seed path/id or query.
- `source_graph_neighbors`: return graph neighbors for a seed path/id.

All read tools auto-update the DB when the Markdown file set or file mtimes differ from the stored index.
