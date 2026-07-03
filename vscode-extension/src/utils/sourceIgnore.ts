import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const MPS_IGNORE_FILE = '.mps/.mpsignore';
export const MPS_IGNORE_FILES = [MPS_IGNORE_FILE];

const DEFAULT_IGNORE_PATTERNS = ['.mps/**'];

export interface SourceIgnoreMatcher {
  patterns: string[];
  isIgnored(relativePath: string): boolean;
}

export async function loadSourceIgnoreMatcher(workspaceFolder: vscode.WorkspaceFolder): Promise<SourceIgnoreMatcher> {
  await ensureSourceIgnoreFile(workspaceFolder);
  const patterns = [...DEFAULT_IGNORE_PATTERNS];
  for (const ignoreFile of MPS_IGNORE_FILES) {
    try {
      const source = await fs.readFile(path.join(workspaceFolder.uri.fsPath, ignoreFile), 'utf8');
      patterns.push(...parseIgnoreRules(source));
    } catch {
      // Missing ignore files keep only default generated paths ignored.
    }
  }
  return createIgnoreMatcher(patterns);
}

export async function ensureSourceIgnoreFile(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  const ignorePath = path.join(workspaceFolder.uri.fsPath, MPS_IGNORE_FILE);
  await fs.mkdir(path.dirname(ignorePath), { recursive: true });
  try {
    await fs.access(ignorePath);
    return ignorePath;
  } catch {
    // Create below.
  }
  await fs.writeFile(ignorePath, buildSourceIgnoreTemplate(), 'utf8');
  return ignorePath;
}

export async function isSourceIgnoredUri(uri: vscode.Uri): Promise<boolean> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return false;
  const matcher = await loadSourceIgnoreMatcher(workspaceFolder);
  return matcher.isIgnored(vscode.workspace.asRelativePath(uri, false));
}

export function parseIgnoreRules(source = ''): string[] {
  return String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, ''))
    .filter(Boolean);
}

export function createIgnoreMatcher(patterns: string[]): SourceIgnoreMatcher {
  const rules = patterns.map((pattern) => ({
    pattern,
    regex: globToRegExp(pattern),
  }));
  return {
    patterns,
    isIgnored(value: string): boolean {
      const normalized = normalizeIgnorePath(value);
      if (!normalized) return false;
      return rules.some((rule) => rule.regex.test(normalized));
    },
  };
}

function normalizeIgnorePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, '');
}

function buildSourceIgnoreTemplate(): string {
  return [
    '# Agent Docs ignore rules',
    '# One glob per line. Run `node scripts/source-graph.mjs audit --root .` first when you want recommendations.',
    '# Common document-focused examples:',
    '# .codex/**',
    '# .agents/**',
    '# .claude/**',
    '# .gemini/**',
    '# .cursor/**',
    '# ai_skills/**',
    '# vscode-extension/ai_skills/**',
    '# test/**',
    '# raw/**',
    '# **/drafts/**',
    '# *.draft.md',
    '',
  ].join('\n');
}

function globToRegExp(pattern: string): RegExp {
  const raw = String(pattern || '').replace(/\\/g, '/').trim();
  const directoryOnly = raw.endsWith('/');
  let text = normalizeIgnorePath(pattern);
  if (!text) return /^$/;
  text = text.replace(/\/+$/g, '');
  if (!text.includes('/')) {
    text = `**/${text}`;
  }
  if ((directoryOnly || (!hasGlob(text) && !/\.[^/]+$/.test(text)))) {
    text = `${text}/**`;
  }
  let out = '^';
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
    if (ch === '*') {
      if (next === '*') {
        const after = text[index + 2];
        if (after === '/') {
          out += '(?:.*/)?';
          index += 2;
        } else {
          out += '.*';
          index += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    out += escapeRegExp(ch);
  }
  return new RegExp(`${out}$`);
}

function hasGlob(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
