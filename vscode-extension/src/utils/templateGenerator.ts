import type { SkillMeta } from './skillScanner.js';

/**
 * A single block placed on the Template Canvas.
 */
export interface TemplateBlock {
  /** Matches `SkillMeta.id` */
  skillId: string;
  /** Zero-based position in the canvas (top → bottom) */
  order: number;
}

/**
 * Generates a structured Markdown template document from an ordered list
 * of canvas blocks and the full skill metadata catalogue.
 *
 * The output follows the Markdown Pattern Studio frontmatter convention:
 *
 * ```yaml
 * ---
 * title: "새 문서"
 * md-studio:
 *   skills: ["clarify", "audit"]
 * ---
 * ```
 *
 * Each skill becomes a h2 section with a comment block containing its
 * template hint, so the author immediately understands what to write.
 */
export function generateMarkdownTemplate(
  blocks: TemplateBlock[],
  skills: SkillMeta[],
): string {
  if (blocks.length === 0) {
    return buildEmptyTemplate();
  }

  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const skillMap = new Map(skills.map((s) => [s.id, s]));

  const skillIds = sorted.map((b) => b.skillId).filter((id) => skillMap.has(id));
  const uniqueSkillIds = [...new Set(skillIds)];

  const frontmatter = buildFrontmatter(uniqueSkillIds);
  const sections = sorted
    .map((block) => {
      const skill = skillMap.get(block.skillId);
      if (!skill) return null;
      return buildSection(skill);
    })
    .filter((s): s is string => s !== null);

  return [frontmatter, '', ...sections].join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildFrontmatter(skillIds: string[]): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const skillList = skillIds.map((id) => `"${id}"`).join(', ');

  return [
    '---',
    `title: "새 문서 (${dateStr})"`,
    'md-studio:',
    `  skills: [${skillList}]`,
    '---',
  ].join('\n');
}

function buildSection(skill: SkillMeta): string {
  const heading = `## [${skill.id}] ${toTitleCase(skill.name)}`;

  const commentLines: string[] = [];
  if (skill.description) {
    commentLines.push(`  목적: ${skill.description.slice(0, 100)}`);
  }
  if (skill.templateHint) {
    commentLines.push(`  가이드: ${skill.templateHint.slice(0, 100)}`);
  }

  const comment =
    commentLines.length > 0
      ? `<!--\n${commentLines.join('\n')}\n-->`
      : '';

  const placeholder = '(여기에 내용을 작성하세요)';

  const parts = [heading, ''];
  if (comment) parts.push(comment, '');
  parts.push(placeholder, '', '---', '');

  return parts.join('\n');
}

function buildEmptyTemplate(): string {
  return [
    '---',
    'title: "새 문서"',
    'md-studio:',
    '  skills: []',
    '---',
    '',
    '# 제목',
    '',
    '(Canvas에서 스킬을 추가하면 섹션이 자동으로 생성됩니다)',
    '',
  ].join('\n');
}

function toTitleCase(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
