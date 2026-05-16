#!/usr/bin/env node
import { parseMarkdownDocument, registerBuiltInTemplates, renderDocument } from '../public/core/engine.js';
import { TemplateRegistry } from '../public/core/registry.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function render(source) {
  const registry = new TemplateRegistry();
  registerBuiltInTemplates(registry);
  return renderDocument(parseMarkdownDocument(source), { mode: 'paginated' }, registry);
}

function countOccurrences(source, needle) {
  return String(source).split(needle).length - 1;
}

const contextualResult = `---
title: Stats Guard
---

## 14. Contextual Retrieval 1차 결과 {#contextual-result .stats}

| Method | 기대 문서 | Hit | Rank |
| --- | --- | --- | ---: |
| \`bm25_raw\` | \`DOC-SEMANTIC-GLASS\` | false | 없음 |
| \`bm25_contextual\` | \`DOC-SEMANTIC-GLASS\` | true | 1 |
`;

const contextualHtml = render(contextualResult);
assert(contextualHtml.includes('<table class="md-table"'), 'Evidence/result matrix should remain a table in .stats auto mode');
assert(!contextualHtml.includes('class="stat-card'), 'Evidence/result matrix should not become stat cards in .stats auto mode');

const listStats = `
## KPIs {: .stats}

- Adoption | 70% | +12
- Quality | 96% | +4
`;

const listHtml = render(listStats);
assert(countOccurrences(listHtml, 'class="stat-card') === 2, 'Pipe-list KPI shorthand should still render as stat cards');
assert(listHtml.includes('<div class="stat-value">70%</div>'), 'Pipe-list KPI value should render inside a stat card');

const tableStats = `
## PDF 결과 {: .stats}

| 지표 | 값 | 변화 |
| --- | ---: | ---: |
| parent block | 48 | +48 |
| child chunk | 111 | +111 |
`;

const tableStatsHtml = render(tableStats);
assert(countOccurrences(tableStatsHtml, 'class="stat-card') === 2, 'Short KPI table should render as stat cards');
assert(!tableStatsHtml.includes('<table class="md-table"'), 'Short KPI table should be consumed by the stats template');

const forcedTable = `
## KPIs {: .stats statsMode="table"}

- Adoption | 70% | +12
`;

const forcedTableHtml = render(forcedTable);
assert(!forcedTableHtml.includes('class="stat-card'), 'statsMode="table" should disable stat cards');
assert(forcedTableHtml.includes('<ul'), 'statsMode="table" should leave list content in normal flow');

const forcedCards = `
## Forced Cards {: .stats}

| 항목 | 값 |
| --- | --- |
| expected doc | \`DOC-SEMANTIC-GLASS\` |
{: statsMode="cards"}
`;

const forcedCardsHtml = render(forcedCards);
assert(forcedCardsHtml.includes('class="stat-card has-code-like-value"'), 'statsMode="cards" should allow explicit card rendering');
assert(forcedCardsHtml.includes('<code>DOC-SEMANTIC-GLASS</code>'), 'Explicit card rendering should preserve inline code styling');

console.log('stats-template-guard ok');
