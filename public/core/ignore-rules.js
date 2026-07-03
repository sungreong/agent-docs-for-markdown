export const MPS_IGNORE_FILE = '.mps/.mpsignore';
export const MPS_IGNORE_FILES = [MPS_IGNORE_FILE];

export function parseIgnoreRules(source = '') {
  return String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, ''))
    .filter(Boolean);
}

export function createIgnoreMatcher(patterns = []) {
  const rules = patterns.map((pattern) => ({
    pattern,
    regex: globToRegExp(pattern),
  }));
  return {
    patterns,
    isIgnored(value) {
      const normalized = normalizeIgnorePath(value);
      if (!normalized) return false;
      return rules.some((rule) => rule.regex.test(normalized));
    },
  };
}

export function normalizeIgnorePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, '');
}

function globToRegExp(pattern) {
  const raw = String(pattern || '').replace(/\\/g, '/').trim();
  const directoryOnly = raw.endsWith('/');
  let text = normalizeIgnorePath(pattern);
  if (!text) return /^$/;
  text = text.replace(/\/+$/g, '');
  if (!text.includes('/')) {
    text = `**/${text}`;
  }
  if (directoryOnly || !hasGlob(text) && !/\.[^/]+$/.test(text)) {
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
  out += '$';
  return new RegExp(out);
}

function hasGlob(value) {
  return /[*?[\]{}]/.test(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
