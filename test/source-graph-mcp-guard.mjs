import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mps-source-graph-mcp-'));

class McpClient {
  constructor(childProcess) {
    this.child = childProcess;
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.child.stdout.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.readMessages();
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr || ''}${String(chunk)}`;
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP timeout for ${method}\n${this.stderr || ''}`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  readMessages() {
    while (this.buffer.length) {
      const end = this.buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const header = this.buffer.slice(0, end).toString('utf8');
      const length = Number(header.match(/content-length:\s*(\d+)/i)?.[1] || 0);
      if (!length) {
        this.buffer = this.buffer.slice(end + 4);
        continue;
      }
      const start = end + 4;
      const bodyEnd = start + length;
      if (this.buffer.length < bodyEnd) return;
      const message = JSON.parse(this.buffer.slice(start, bodyEnd).toString('utf8'));
      this.buffer = this.buffer.slice(bodyEnd);
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }
}

await fs.writeFile(
  path.join(tmpRoot, 'index.md'),
  '# Index\n\n- [Guide](guide.md)\n- [Reference](reference.md)\n',
  'utf8',
);
await fs.writeFile(path.join(tmpRoot, 'guide.md'), '# Guide\n\nRelated to [[reference]].\n', 'utf8');
await fs.writeFile(path.join(tmpRoot, 'reference.md'), '# Reference\n\nBack to [Index](index.md).\n', 'utf8');

const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'source-graph.mjs'), 'mcp', '--root', tmpRoot], {
  cwd: repoRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const client = new McpClient(child);
try {
  const initialized = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'source-graph-mcp-guard', version: '0.0.0' },
  });
  assert(initialized.serverInfo?.name === 'markdown-agent-docs-source-graph', 'expected server info');

  const tools = await client.request('tools/list', {});
  const names = new Set((tools.tools || []).map((tool) => tool.name));
  assert(names.has('source_graph_search'), 'missing search tool');
  assert(names.has('source_graph_related'), 'missing related tool');
  const searchTool = (tools.tools || []).find((tool) => tool.name === 'source_graph_search');
  assert(searchTool?.inputSchema?.properties?.includeLinks?.type === 'boolean', 'missing search includeLinks option');
  assert(searchTool?.inputSchema?.properties?.linksDepth?.type === 'number', 'missing search linksDepth option');

  const update = await client.request('tools/call', {
    name: 'source_graph_update',
    arguments: { root: tmpRoot },
  });
  const updateText = update.content?.[0]?.text || '';
  assert(updateText.includes('"documents": 3'), 'expected update summary');

  await fs.writeFile(path.join(tmpRoot, 'guide.md'), '# Guide\n\nRelated to [[reference]].\n\nNew code:\n\n```js\nconsole.log("changed");\n```\n', 'utf8');
  const related = await client.request('tools/call', {
    name: 'source_graph_related',
    arguments: { root: tmpRoot, path: 'guide.md', limit: 5 },
  });
  const relatedText = related.content?.[0]?.text || '';
  assert(relatedText.includes('reference.md'), 'expected related reference document');
  assert(relatedText.includes('index.md'), 'expected backlink or shared related document');

  const search = await client.request('tools/call', {
    name: 'source_graph_search',
    arguments: { root: tmpRoot, query: 'guide', limit: 1, includeLinks: true, linksDepth: 2 },
  });
  const searchResult = JSON.parse(search.content?.[0]?.text || '[]');
  assert(searchResult[0]?.linksDepth === 2, 'expected search links depth in MCP result');
  assert(Array.isArray(searchResult[0]?.links), 'expected search links in MCP result');
  assert(searchResult[0].links.some((link) => link.sourcePath === 'guide.md' && link.targetPath === 'reference.md'), 'expected guide search links');
} finally {
  child.kill();
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

console.log('source graph MCP guard passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
