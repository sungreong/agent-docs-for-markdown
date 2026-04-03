import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Metadata extracted from a skill's SKILL.md frontmatter.
 */
export interface SkillMeta {
  /** Directory name of the skill folder (e.g. "clarify") */
  id: string;
  /** `name` field from SKILL.md YAML frontmatter */
  name: string;
  /** `description` field from SKILL.md YAML frontmatter */
  description: string;
  /**
   * First non-empty paragraph from the SKILL.md body,
   * used as a short hint when building template comments.
   */
  templateHint: string;
}

/**
 * Scans `skillsDir` for subdirectories that contain a `SKILL.md` file
 * and extracts metadata from the YAML frontmatter.
 *
 * No external YAML parser is required — frontmatter is parsed with a
 * simple regex so the extension stays dependency-free.
 */
export async function scanSkills(skillsDir: string): Promise<SkillMeta[]> {
  let entries: string[];
  try {
    const dirents = await fs.readdir(skillsDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }

  const results: SkillMeta[] = [];

  for (const entry of entries) {
    const skillMdPath = path.join(skillsDir, entry, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMdPath, 'utf8');
      const meta = parseSkillMd(entry, content);
      results.push(meta);
    } catch {
      // Skip directories without a SKILL.md
    }
  }

  return results.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter and extract the first body paragraph from
 * a SKILL.md file. Falls back to the skill folder `id` when fields are
 * missing.
 */
function parseSkillMd(id: string, content: string): SkillMeta {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);

  let name = id;
  let description = '';
  let body = content;

  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    body = content.slice(frontmatterMatch[0].length);

    const nameMatch = yamlBlock.match(/^name:\s*(.+)$/m);
    const descMatch = yamlBlock.match(/^description:\s*(.+)$/m);

    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  const templateHint = extractFirstParagraph(body);

  return { id, name, description, templateHint };
}

/**
 * Returns the first non-empty, non-heading line from the SKILL.md body,
 * trimmed to 120 characters.
 */
function extractFirstParagraph(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    return trimmed.slice(0, 120);
  }
  return '';
}
