# LLM Wiki Agent Improvement Plan

작성일: 2026-07-02

## 한 줄 정의

Markdown Pattern Studio를 `문서 렌더러 + Source Graph + 번들 스킬` 조합에서 한 단계 더 밀어, 에이전트가 Markdown wiki를 더 안전하게 분류, 탐색, 업데이트, 검수할 수 있는 작업보조 플랫폼으로 정리한다.

## 내가 둔 가정

- 주 사용자는 VS Code extension 안에서 Markdown workspace를 탐색하고, 필요할 때 에이전트에게 wiki 작성/정리/업데이트를 맡긴다.
- 에이전트 품질의 병목은 렌더링보다 `검색 코퍼스 오염`, `중복 스킬 복사본`, `draft/test/skill 문서 혼입`, `업데이트 영향 범위 미계획`에 있다.
- 사용자는 문서 구조를 강하게 강제당하길 원하지 않는다. 따라서 자동 구조 재배치보다 `진단`, `추천`, `컨텍스트 패키징`, `업데이트 계획`이 우선이다.

## 문제 정의

현재 확장은 preview/export/search는 강하지만, 에이전트가 wiki를 만지기 전에 필요한 질문에 대한 보조층이 약하다.

- 어떤 폴더를 `.mpsignore`에 넣어야 하는가
- 어떤 문서가 실제 wiki 코퍼스이고 어떤 문서가 support noise인가
- 어떤 문서를 수정할 때 어떤 문서를 같이 봐야 하는가
- 같은 주제의 문서가 여러 개일 때 무엇을 정본 후보로 봐야 하는가
- 링크 품질이 낮은 상태에서 에이전트가 잘못된 graph evidence를 과신하지 않게 하려면 무엇을 먼저 고쳐야 하는가

### 코드 기준 근거

- Source Graph CLI는 이미 `update`, `search`, `related`, `neighbors`를 제공한다: [scripts/source-graph.mjs](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/scripts/source-graph.mjs:1)
- VS Code extension은 `.mpsignore` 편집 명령은 있지만 추천/진단은 없다: [vscode-extension/src/commands/sourceGraph.ts](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/vscode-extension/src/commands/sourceGraph.ts:754)
- 번들 스킬은 현재 `search`, `writing`, `production check` 중심이라 `triage`, `ignore`, `update impact`, `canonical` 계층이 비어 있었다: [ai_skills/codex/skills](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/ai_skills/codex/skills)

## 현재 워크스페이스 진단 스냅샷

2026-07-02 기준 `node scripts/source-graph.mjs audit --root .` 실행 결과:

- Markdown files: `1015`
- Ignored markdown files: `0`
- Duplicate copy groups: `30`
- Unresolved internal links: `10`
- 주요 ignore 추천: `.codex/**`, `.agents/**`, `.claude/**`, `.gemini/**`, `ai_skills/**`, `vscode-extension/ai_skills/**`, `test/**`

이 수치는 이 저장소가 `문서 wiki 코퍼스`보다 `스킬 저장소 + 확장 번들 + 테스트 fixture + 문서`가 섞인 상태임을 보여준다.

## 이번 버전에서 풀 문제

- Source Graph가 `.mpsignore` 후보를 기계적으로 추천하게 만든다.
- 에이전트가 wiki 작업 전에 workspace triage를 수행할 수 있게 한다.
- 에이전트가 topic context를 묶고, 변경 영향 범위를 계획하고, canonical 후보를 추천하고, 링크 품질을 점검할 수 있게 한다.
- 위 흐름을 extension 번들 스킬로 배포 가능하게 만든다.

## 이번 버전에서 풀지 않을 문제

- 자동 canonical 확정
- 자동 `.mpsignore` 수정
- 문서 frontmatter 강제
- Source Graph ranking 모델의 대규모 재설계

## 가장 위험한 가정

| ID | 가정 | 왜 위험한가 | 검증 방법 | 통과 기준 |
|---|---|---|---|---|
| A1 | `.mpsignore` 추천만으로 검색 품질이 크게 좋아진다 | 잘못된 canonical 문서나 링크 오탐은 ignore만으로 해결되지 않을 수 있다 | audit 전후 search 결과 비교 | 대표 주제 검색 상위 결과에서 skill/test 노이즈 감소 |
| A2 | 새 스킬이 실제로 에이전트 행동을 바꾼다 | 스킬이 있어도 CLI 진단이 약하면 반복 검색만 할 수 있다 | skill 문서에 audit/search/related/neighbors 흐름 강제 | 에이전트가 answer 전에 audit 또는 graph evidence를 언급 |
| A3 | workspace triage와 ignore advisor를 분리하는 것이 유용하다 | 스킬 수가 많아져 사용자가 헷갈릴 수 있다 | 사용자 문구/설치 흐름 검토 | 역할이 1문장으로 구분 가능 |
| A4 | hidden skill roots를 graph에 포함하는 편이 맞다 | 일부 사용자는 애초에 hidden roots를 보고 싶지 않을 수 있다 | `.mpsignore`와 audit 추천으로 보정 | 사용자가 필요 시 포함/제외를 제어 가능 |

## PR/FAQ 요약

### Press Release 요약

Markdown Pattern Studio now helps agents clean up a Markdown wiki before they touch it. Instead of searching a noisy workspace blindly, bundled skills can audit ignore candidates, package grounded context, plan update impact, recommend canonical pages, and flag link repair work from the same local Source Graph used in VS Code.

### External FAQ 요약

1. 이 기능은 누구를 위한가?
   VS Code에서 Markdown wiki를 유지하고, 에이전트에게 작성/정리 업무를 맡기려는 사용자.
2. 기존 search skill과 무엇이 다른가?
   `search`는 찾기, 새 스킬들은 `분류`, `계획`, `구조 보정`에 집중한다.
3. `.mpsignore`를 자동으로 바꾸는가?
   아니다. 추천과 근거만 제공하고 적용은 사용자가 결정한다.

### Internal FAQ 요약

1. 왜 새 UI보다 CLI audit를 먼저 만들었는가?
   스킬, 테스트, 확장 번들, CLI가 같은 진단 표면을 공유해야 유지 비용이 낮기 때문이다.
2. 왜 canonical을 자동 확정하지 않는가?
   사용자가 만든 자유 문서 구조에서는 오판 비용이 크기 때문이다.

## PRD 요약

### 목표

- G1: Source Graph CLI가 wiki 작업 전 audit 정보를 제공한다.
- G2: 번들 스킬이 `검색 -> triage -> context -> update plan` 순서로 작동한다.
- G3: extension 사용자가 `.mpsignore`를 더 빠르게 이해할 수 있다.

### 비목표

- NG1: 전체 wiki 정보를 자동 정규화하지 않는다.
- NG2: 확장 UI에 새 복잡한 webview를 이번 버전에 추가하지 않는다.

### 기능 요구사항

| ID | 요구사항 | Acceptance Criteria |
|---|---|---|
| FR-1 | Source Graph CLI에 workspace audit 명령을 추가한다 | `node scripts/source-graph.mjs audit --root .`가 ignore 추천, duplicate copy groups, unresolved links, orphan docs를 JSON으로 반환 |
| FR-2 | audit는 hidden skill roots와 bundled skill copies를 명시적으로 진단한다 | `.codex`, `.agents`, `.claude`, `.gemini`, `ai_skills`, `vscode-extension/ai_skills`, `test` 계열 추천이 필요 시 노출 |
| FR-3 | `.mpsignore` 생성 템플릿에 audit 힌트와 wiki-focused 예시를 넣는다 | 새 ignore 파일 생성 시 audit 명령과 주요 예시 패턴이 포함 |
| FR-4 | 번들 skill pack에 wiki triage/update/link/canonical 계층을 추가한다 | Codex/Claude/Agents 번들과 extension bundle에 새 skill folders가 복제됨 |
| FR-5 | 최소 한 개의 테스트 가드가 새 audit 출력을 검증한다 | temp workspace 기반 guard가 audit JSON의 핵심 필드를 검증 |
| FR-6 | Source Graph launcher에서 audit와 ignore 후보 반영 흐름을 바로 실행할 수 있다 | 런처에서 `Run Workspace Audit` 실행 후 추천 패턴을 `Add to .mpsignore`로 반영하고 결과가 다시 갱신됨 |

### 비기능 요구사항

| 영역 | 요구사항 | 검증 방법 |
|---|---|---|
| 안정성 | 기존 `update/search/related/neighbors` 동작을 깨지 않는다 | `npm run test:source-graph` |
| 이식성 | root CLI와 VS Code bundled CLI가 같은 동작을 유지한다 | `node vscode-extension/tools/sync-cli-bundle.mjs` + guard |
| 설명 가능성 | ignore 추천은 이유와 tradeoff를 포함한다 | audit JSON review |

## 에이전트용 기능 스펙

### 기능 요약

`audit` 명령은 Markdown workspace를 wiki 작업 관점으로 요약한다. 새 스킬들은 이 명령과 기존 graph 명령을 조합해 agent workflow를 표준화한다.

### 변경 범위

- Source Graph CLI: [scripts/source-graph.mjs](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/scripts/source-graph.mjs:1)
- VS Code bundled CLI copy: [vscode-extension/scripts/source-graph.mjs](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/vscode-extension/scripts/source-graph.mjs:1)
- Ignore file bootstrap: [vscode-extension/src/commands/sourceGraph.ts](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/vscode-extension/src/commands/sourceGraph.ts:754)
- Bundled skills: [ai_skills/codex/skills](/C:/Users/leesu/Documents/ProjectCode/01_2026_EXP/markdown-pattern-studio/ai_skills/codex/skills)

### 변경 금지 범위

- renderer HTML output
- Source Graph SQLite schema
- VS Code webview UI 구조 대수술

### 상태/UX

| 상태 | 사용자에게 보이는 것 | 시스템 동작 |
|---|---|---|
| Loading | CLI audit 실행 중 | graph를 읽거나 자동 갱신 후 JSON 생성 |
| Empty | 추천 없음 또는 약함 | 빈 배열과 notes 반환 |
| Error | 기존 Source Graph CLI 에러 | stderr와 기존 오류 처리 사용 |
| Success | ignore 추천, duplicate group, orphan/unresolved link 요약 | 스킬이 후속 판단 재료로 사용 |

### 데이터 계약

`audit` JSON 핵심 필드:

- `summary`
- `ignore.defaultPatterns`
- `ignore.userPatterns`
- `ignore.recommendations[]`
- `ignore.reviewItems[]`
- `graph.entryDocuments[]`
- `graph.orphanDocuments[]`
- `graph.unresolvedLinks[]`
- `graph.duplicateCopyGroups[]`

## 작업 분해

### T1. Source Graph audit CLI

- 목표: wiki 작업 전 corpus 상태를 기계적으로 설명
- 변경 예상 파일: `scripts/source-graph.mjs`, `vscode-extension/scripts/source-graph.mjs`
- 검증 명령: `node test/source-graph-audit-guard.mjs`

### T2. Ignore bootstrap 개선

- 목표: 빈 `.mpsignore` 대신 audit-aware 템플릿과 launcher follow-up 제공
- 변경 예상 파일: `vscode-extension/src/commands/sourceGraph.ts`, `.mpsignore`
- 검증 명령: `cd vscode-extension && npm run build`

### T2b. Launcher audit UX

- 목표: 상태 확인, audit 실행, ignore 후보 반영을 한 패널 안에서 닫기
- 변경 예상 파일: `vscode-extension/src/commands/sourceGraph.ts`, `vscode-extension/README.md`
- 검증 명령: `node test/vscode-extension-cross-platform-guard.mjs`

### T3. Wiki skill pack 추가

- 목표: search 이후 triage/update/context/link 흐름 제공
- 변경 예상 파일: `ai_skills/*/skills/*`, `vscode-extension/ai_skills/*`
- 검증 명령: 번들 디렉터리 존재 확인, skill text smoke

### T4. Regression guard 추가

- 목표: audit 출력 최소 계약 보호
- 변경 예상 파일: `test/source-graph-audit-guard.mjs`, `package.json`
- 검증 명령: `npm run test:source-graph`

## 비판적 리뷰 결과

### Must fix

- canonical 판단은 아직 backlink/title heuristic 수준이며 human approval이 필요하다.

### Should fix

- unresolved link 외에 `resolved-by-name`의 오탐 가능성도 진단
- 문서 상태 배지(`canonical candidate`, `draft`, `reviewed`)를 extension file browser나 graph에 노출

## UX 체크리스트

- 런처를 열었을 때 그래프가 있는지 없는지 바로 이해된다.
- 사용자가 다음 행동을 `Start Graph`, `Open Graph`, `Run Workspace Audit` 중 하나로 바로 고를 수 있다.
- audit 결과에서 ignore 후보와 그래프 약점을 한 화면에서 확인할 수 있다.
- 추천 패턴을 `.mpsignore`에 복붙하지 않고 바로 반영할 수 있다.
- 반영 직후 audit 결과가 갱신되어 사용자가 변화 여부를 확인할 수 있다.

### Go / No-go

Go. 현재 병목은 분명하고, 기존 CLI와 스킬 구조에 얹을 수 있는 작은 PR 단위 변경이다.

## 구현 에이전트용 프롬프트

```text
이 저장소를 먼저 탐색해줘. 아직 코드를 수정하지 마.
목표 기능: Source Graph audit + wiki agent skill pack
관련 문서:
- docs/planning/llm-wiki-agent-improvement-plan.md
- scripts/source-graph.mjs
- vscode-extension/src/commands/sourceGraph.ts
- ai_skills/codex/skills/*

확인할 것:
1. audit JSON 계약
2. 번들 skill 복제 경로
3. source-graph 관련 테스트 위치와 실행 명령
4. .mpsignore bootstrap 흐름
5. 변경 후 sync가 필요한 extension bundle 파일
```

## 다음 질문

- audit 결과를 VS Code Source Graph launcher 안에서 바로 보여줄지
- canonical 후보를 frontmatter/metadata로 저장할지
- 사용자 문서를 구조화할 때 `status` 메타데이터를 선택형으로 제안할지
