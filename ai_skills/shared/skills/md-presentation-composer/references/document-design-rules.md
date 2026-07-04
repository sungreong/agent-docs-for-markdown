# Document Design Rules

Markdown을 문서로 재구성할 때 쓰는 디자인 판단 기준입니다. 목표는 예쁘게 꾸미는 것이 아니라 목적에 맞는 정보 위계를 만드는 것입니다.

## 목적별 기본 구조

| 목적 | 첫 페이지/첫 화면 | 본문 구조 | 우선 요소 |
| --- | --- | --- | --- |
| report | 핵심 메시지, 결정 포인트, KPI 요약 | 근거, 비교, 리스크, 권고안 | 요약, 표, 수치, 결론 |
| proposal | 문제 정의와 제안 방향 | 해결책, 차별점, 기대 효과, 일정 | before/after, 로드맵, 리스크 |
| technical | 목적, 환경, 빠른 시작 | 절차, 코드, API, 장애 대응 | 코드 정확성, 단계, 주의사항 |
| tutorial | 학습 목표와 준비물 | 단계별 실습, 예제, 체크리스트 | 순서, 피드백 지점, 완료 조건 |
| presentation | 한 페이지 한 메시지 | 근거 페이지, 데이터 페이지, 결론 | page-break, lead, 시각 위계 |
| briefing | 지금 중요한 요점과 왜 중요한가 | 핵심 업데이트/발견, 영향, 배경, 출처, 다음 관찰점 | 우선순위, 출처, 미확인 사항 표시 |

presentation 또는 PPT형 변환은 `ppt-like-markdown-rules.md`를 우선 적용합니다.

브랜드나 특정 디자인 분위기가 요구되면 `references/design-md/design-md-insights.md`와 `references/design-md/design-md-decision-framework.md`를 먼저 봅니다. 특정 회사명이 명시된 경우에만 `references/design-md/raw/<slug>/DESIGN.md`를 열어 세부 규칙을 확인합니다.

문서 변환은 항상 전체 읽기에서 시작합니다. 섹션을 하나씩 꾸미기 전에 목적, narrative spine, content families, 보존해야 할 artifact, 반복할 component system을 먼저 정합니다.

추가로 사용자 요청을 작은 계약처럼 정리합니다. 최종 문서의 각 섹션은 사용자 요구사항, 독자에게 필요한 정보, 또는 근거 제시 중 하나와 연결되어야 합니다. 연결되지 않는 장식성 섹션은 제거합니다.

## 레이아웃 선택

- 표: 숫자, 상태, 여부, 등급처럼 비교 축이 명확할 때 사용합니다. 6열 이상이면 `landscape`, `.table-fit`, page-break 후보로 봅니다.
- 표 caption은 표의 맥락이나 읽는 관점만 짧게 설명합니다. caption을 병합된 첫 행처럼 길게 쓰거나, 컬럼 헤더 위에 또 다른 헤더처럼 보이게 만들지 않습니다.
- 카드: 독립 항목 3~6개를 나란히 비교할 때만 사용합니다. 카드마다 제목, 핵심 문장, 세부 설명의 밀도를 맞추고, 카드 제목은 1~3개의 짧은 단어로 제한합니다.
- Stats 카드: KPI처럼 한 값이 주인공인 경우에만 사용합니다. 검색 평가, Method/Hit/Rank, qrels, code identifier가 들어간 표는 `.stats`가 아니라 표/비교/근거 슬라이드로 둡니다.
- 표현 유틸: 3~6개 peer item은 `.feature-grid`, 단일 핵심 수치는 `.big-number-hero`, 문제 제기는 `.problem-statement`, before/after는 `.contrast-pair`, 블로그/hero처럼 중앙 안전 영역이 중요한 섹션은 `.safe-zone`을 사용합니다. `.feature-grid`는 짧은 굵은 라벨과 설명 문장으로 쓰고, 긴 heading 카드처럼 만들지 않습니다.
- 목록: 절차, 조건, 체크리스트, 의사결정 기준처럼 순서나 실행 단위가 중요할 때 사용합니다.
- 2단/3단: 비교, 요약, before/after, 장단점처럼 같은 수준의 정보가 나란히 읽혀야 할 때 사용합니다.
- Callout: 독자가 놓치면 안 되는 주의, 결정, 결론에만 사용합니다. 일반 문단을 모두 callout으로 바꾸지 않습니다.
- Image: 본문 이해에 직접 필요한 경우에만 사용하고 alt/caption을 둡니다. 설명과 이미지는 가능한 같은 페이지에 둡니다.
- Code: 의미를 바꾸지 말고 언어명을 유지/보강합니다. 긴 코드는 `maxHeight`를 우선 검토합니다.

## Decision Tree

1. 문서 목적을 정합니다.
   - 의사결정/성과/현황이면 `report`.
   - 승인/수주/설득이면 `proposal`.
   - 설치/구현/API/운영이면 `technical`.
   - 학습/실습/따라하기이면 `tutorial`.
   - 발표 화면 단위가 중요하면 `presentation`.
   - 브랜드/분위기 재현이 중요하면 DESIGN.md archetype을 함께 정합니다.
2. 첫 페이지 역할을 정합니다.
   - `report`: executive summary와 핵심 수치가 없으면 추가 제안.
   - `proposal`: 문제 정의와 제안의 한 줄 가치가 없으면 추가 제안.
   - `technical`: 빠른 시작 또는 전제 조건이 없으면 추가 제안.
   - `tutorial`: 학습 목표와 완료 조건이 없으면 추가 제안.
   - `presentation`: cover, agenda, key message, closing 중 빠진 흐름을 추가 제안.
   - `briefing`: 현재 중요한 요점, 왜 중요한가, 출처/미확인 사항이 없으면 추가 제안.
3. 요청 추적성을 확인합니다.
   - 사용자가 요구한 필수 항목이 모두 들어가는지 확인합니다.
   - 사용자가 금지하거나 원하지 않은 방향이 섞이지 않았는지 확인합니다.
   - 각 섹션이 어떤 요구사항을 만족하는지 표시할 수 없으면 병합/삭제합니다.
4. 밀도를 판정합니다.
   - 한 섹션에 표, 코드, 이미지가 2개 이상 섞이면 분리 후보.
   - 6줄 이상 문단은 목록/소제목/표로 분리 후보.
   - 6열 이상 표 또는 12행 이상 표는 `landscape`, `.table-fit`, page-break 후보.
5. 문서 전체의 component system을 정합니다.
   - 반복할 evidence treatment, KPI treatment, code/table treatment, expressive template 수를 먼저 제한합니다.
   - 기술/리포트 문서는 화려한 템플릿을 많이 쓰기보다 같은 근거 표현을 일관되게 반복합니다.
6. 레이아웃을 선택합니다.
   - 같은 축의 비교는 표 또는 2단.
   - 독립 항목 3~6개는 카드. 제목이 길어 카드 안에서 글자 단위로 깨지면 목록, `.timeline`, `.icon-list`로 바꿉니다.
   - 실행 순서는 목록/체크리스트.
   - 핵심 결론 하나는 message/lead.
   - 브리핑/리서치 요약은 `.briefing-lead`로 핵심 요점을 먼저 잡고, `.priority-strip`으로 상위 업데이트/리스크/액션을 짧게 훑게 하며, `.evidence-ledger`로 출처를 뒤에 정리합니다.
   - 브랜드 스타일은 템플릿 선택으로 번역합니다: 사진 중심은 half-bleed, 데이터 중심은 stats/table-fit, 개발자 도구는 dark/code/timeline, 에디토리얼은 quote/two-column.
7. 안전성을 확인합니다.
   - 코드, 표, 링크, 이미지 문법은 의미를 바꾸지 않습니다.
   - 불확실한 수치/결론은 만들지 않고 “보강 필요”로 표시합니다.
   - 실제 렌더링에서 깨지는 표현은 제거하거나 단순한 Markdown 구조로 되돌립니다.

## Page Break 규칙

- 보고서: executive summary, 핵심 표, 리스크/권고안 앞을 우선 후보로 봅니다.
- 제안서: 문제 정의, 해결책, 일정/비용, 기대 효과를 분리합니다.
- 기술문서: 설치/실행, 코드/API, 트러블슈팅을 분리합니다.
- 튜토리얼: 큰 단계 또는 실습 완료 기준 앞에서 분리합니다.
- 발표형 문서: 한 페이지에 하나의 핵심 메시지를 둡니다.
- 브리핑/리서치 요약/현재 이슈: 핵심 업데이트와 "왜 중요한가"를 앞쪽에 두고, 배경/출처/방법론은 뒤쪽으로 보냅니다.
- 표/이미지/코드가 페이지 하단에서 잘릴 가능성이 있으면 앞쪽에 page-break를 둡니다.

## 피해야 할 안티패턴

- 모든 내용을 카드나 callout으로 만드는 것: 카드가 6개를 넘거나 본문 대부분이 callout이면 줄입니다.
- 같은 카드/통계 패턴을 목적이 다른 섹션에 반복하는 것: 반복은 content family가 같을 때만 허용합니다.
- 표 안에 긴 설명 문장을 과도하게 넣는 것: 셀 하나가 80자를 넘으면 목록/카드 전환을 검토합니다.
- 표의 첫 행을 병합 제목처럼 쓰는 것: 제목/맥락은 섹션 heading, lead 문장, 또는 `caption="짧은 표 맥락"`으로 분리합니다. 컬럼 헤더는 실제 비교 축만 둡니다.
- 제목만 많고 각 섹션의 역할이 분명하지 않은 것: heading 단계가 건너뛰거나 빈 heading이 있으면 고칩니다.
- 색상/강조를 의미 없이 반복하는 것: 강조는 결정, 위험, 핵심 메시지에만 씁니다.
- 출력용 문서에서 접기, hover, 검색 같은 화면 인터랙션에 의존하는 것.
- 코드블록을 디자인 목적으로 재포맷해서 실행 의미를 바꾸는 것.
- 원문에 없던 강한 결론을 만들어내는 것.

## DOCX/Word handoff 관점

Word/DOCX 변환 가능성이 있거나 사용자가 report, memo, letter, template 같은 산출물을 언급하면 아래 기준을 함께 적용합니다.

- heading 단계는 순차적이어야 하며, 나중에 목차/outline으로 사용할 수 있어야 합니다.
- 목록은 실제 Markdown list로 둡니다. bullet 기호를 텍스트로 직접 입력하지 않습니다.
- page-break는 섹션 사이에만 둡니다. 문단/표/코드 중간에 넣지 않습니다.
- 표는 실제 비교 데이터에만 사용하고, layout-only table은 피합니다.
- 표 caption은 짧게 두고, 열 머리글은 실제 비교 축만 담습니다.
- wide table은 `.table-fit`, 분리, landscape 후보 중 하나로 표시합니다.
- 이미지는 alt/caption을 두고 설명 텍스트와 가까이 둡니다.
- hover, 접기, fixed viewer chrome 같은 화면 인터랙션에 핵심 의미를 의존하지 않습니다.

## 변환 제안에 포함할 것

아래 구조로 제안합니다.

```text
[DOCUMENT PLAN]
문서 목적, 독자, 첫 페이지 역할

[SECTION BREAKDOWN]
섹션 재배치와 page-break 계획

[DESIGN DECISIONS]
표/카드/목록/이미지/코드 선택 이유

[RISK CHECK]
원문 의미 보존 리스크와 보강 필요 항목
```
