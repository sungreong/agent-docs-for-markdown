# 사용성 개선 기획: Markdown Pattern Studio

작성일: 2026-07-01

## 한 줄 정의

Markdown Pattern Studio의 다음 개선 방향은 “기능을 더 늘리는 것”보다, 처음 쓰는 사용자가 문서 열기, 미리보기, 패턴 적용, HTML 내보내기, Source Graph/스킬 설치까지 길을 잃지 않게 만드는 것이다.

## 사용한 관점

- Vibe planning: 대상 사용자, 문제, 비목표, acceptance criteria, 작은 작업 단위로 정리한다.
- UI/UX Pro Max: 접근성, 터치/상호작용, 성능, 레이아웃/반응형, 내비게이션, 폼/피드백 우선순위로 검토한다.

## 대상 사용자

| 사용자 | 상황 | 핵심 문제 |
|---|---|---|
| Markdown 작성자 | VS Code에서 보고서/블로그/발표 문서를 만든다 | 어떤 명령을 써야 원하는 HTML이 나오는지 헷갈린다 |
| 문서 디자이너 | Markdown에 패턴 문법을 추가해 더 보기 좋은 산출물을 만든다 | 패턴 문법과 렌더 결과의 연결을 기억해야 한다 |
| 지식관리/리서치 사용자 | 많은 Markdown 파일의 링크와 출처를 탐색한다 | Source Graph 초기화, 갱신, 번들 스킬 설치의 차이가 불명확하다 |
| AI 에이전트 사용자 | 스킬을 설치해 문서 작성/검토를 자동화한다 | 어떤 스킬이 어디에 설치되는지, 성공했는지 알기 어렵다 |

## 문제 정의

현재 제품은 기능 폭이 넓지만 첫 사용자가 따라갈 “기본 경로”가 약하다. 사용자는 브라우저 스튜디오, VS Code preview, CLI, Source Graph, skill install 중 어디서 시작해야 하는지 판단해야 하며, export target과 appearance 옵션도 기능명만으로는 결과 차이를 예측하기 어렵다.

## 이번 버전에서 풀 문제

- 첫 사용자에게 가장 짧은 성공 경로를 보여준다.
- preview/export/graph/skill 기능을 역할별로 재정렬한다.
- 선택지가 많은 곳에 상태 설명, 권장값, 복구 경로를 추가한다.
- 품질 경고와 진단 결과를 “무슨 문제가 있고 어디를 누르면 되는지”로 바꾼다.

## 이번 버전에서 풀지 않을 문제

- 새 렌더링 엔진 도입
- 전체 디자인 시스템 재작성
- 계정, 클라우드 동기화, 협업 기능
- AI 자동 문서 생성 기능 자체
- Source Graph의 분석 모델을 대규모로 변경

## 가장 위험한 가정

| ID | 가정 | 왜 위험한가 | 검증 방법 | 통과 기준 |
|---|---|---|---|---|
| A1 | 사용자는 VS Code 확장을 주 경로로 쓴다 | 브라우저 스튜디오가 더 쉬울 수 있다 | README/Marketplace CTA 클릭 흐름과 사용자 피드백 확인 | 첫 실행 사용자의 70% 이상이 VS Code 경로를 이해 |
| A2 | onboarding 문구만으로 기능 이해가 개선된다 | UI 구조 자체가 복잡하면 문구로 해결되지 않는다 | 첫 사용 시나리오 5명 테스트 | Markdown 열기부터 HTML 저장까지 3분 이내 |
| A3 | export target 설명이 있으면 선택 오류가 줄어든다 | 사용자는 여전히 standalone/blog embed 차이를 모를 수 있다 | QuickPick 설명과 결과 미리보기 비교 | 잘못된 target 재실행 비율 감소 |
| A4 | Source Graph는 별도 고급 흐름으로 분리해야 쉽다 | 핵심 기능으로 보이지 않아 사용률이 낮아질 수 있다 | File Browser와 Source Graph 진입점 클릭률 비교 | 신규 사용자 혼란 감소, 기존 사용자 접근성 유지 |
| A5 | 스킬 설치는 “설치됨/누락/업데이트 가능” 상태 표시가 중요하다 | 실제 문제는 중앙 저장소/agent 생태계 용어일 수 있다 | 설치 후 진단 로그와 성공 메시지 관찰 | 사용자가 설치 위치를 설명할 수 있음 |

## UX 원칙

1. 기본 경로를 먼저 보여준다: Open Markdown -> Preview -> Adjust Style -> Export.
2. 고급 기능은 숨기지 않되 “왜 쓰는지”가 보일 때만 앞으로 당긴다.
3. 명령 이름보다 사용 결과를 먼저 말한다.
4. 상태는 성공/진행/실패/복구 액션을 함께 표시한다.
5. 설정과 옵션은 권장값을 기본으로 두고, 사용자가 변경한 이유를 기억한다.
6. 키보드, 스크린 리더, 작은 패널 폭에서도 같은 기능을 쓸 수 있어야 한다.

## 개선안 1: 첫 실행 Start Here 패널

### 요약

VS Code 확장과 브라우저 스튜디오 모두 첫 화면에 작은 Start Here 패널을 제공한다. 기능 설명이 아니라 현재 사용자에게 필요한 다음 행동을 보여준다.

### 사용자 흐름

1. 사용자가 Markdown workspace 또는 웹 스튜디오를 연다.
2. 빈 문서/첫 실행 상태면 Start Here가 보인다.
3. 사용자는 `샘플 열기`, `Markdown 열기`, `현재 파일 미리보기`, `HTML로 내보내기` 중 하나를 선택한다.
4. 한 번 성공한 뒤에는 접힌 상태로 전환된다.

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | 첫 실행 상태에서 사용자가 1차 행동을 선택할 수 있다 |
| AC-2 | Start Here는 문서를 가리지 않고 접을 수 있다 |
| AC-3 | 브라우저 스튜디오와 VS Code extension의 문구가 같은 개념어를 쓴다 |
| AC-4 | 키보드로 모든 action에 접근 가능하다 |

## 개선안 2: Export Target 선택을 결과 중심으로 바꾸기

### 현재 문제

Standalone, Blog Embed, Content Fragment는 정확하지만, 처음 쓰는 사람에게는 결과 차이가 즉시 보이지 않는다.

### 제안

QuickPick/웹 버튼 설명을 다음처럼 바꾼다.

| 현재 | 개선 라벨 | 설명 |
|---|---|---|
| Standalone HTML | Complete HTML File / 완성 HTML 파일 | 로컬에서 열거나 공유할 수 있는 전체 뷰어 포함 |
| Blog Embed HTML | Blog Paste HTML / 블로그 붙여넣기 HTML | Tistory, WordPress, Velog 같은 기존 글 편집기에 넣기 좋은 조각 |
| Content Fragment | Content Fragment / 본문 조각 | 다른 시스템에 넣을 CSS-scoped 본문 HTML |

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | 선택 전 각 target의 사용처를 한 문장으로 알 수 있다 |
| AC-2 | 기본 추천은 현재 컨텍스트에 맞다. VS Code 파일 변환은 완성 HTML 파일, 블로그 안내에서는 블로그 붙여넣기 |
| AC-3 | export 완료 메시지에 저장 경로와 다음 행동이 포함된다 |

## 개선안 3: 패턴 가이드를 “삽입 후 결과 보기”로 전환

### 현재 문제

패턴 예시는 코드 조각을 보여주지만, 초보자는 이 조각이 오른쪽 preview에서 어떤 시각 결과가 되는지 상상해야 한다.

### 제안

- 각 패턴 카드에 `삽입`, `미리보기로 이동`, `예시 복사` 액션을 둔다.
- 삽입 후 preview에서 해당 섹션을 하이라이트한다.
- 많이 쓰는 패턴을 `문서 시작`, `보고서`, `슬라이드`, `표/이미지`, `콜아웃`으로 묶는다.

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | 패턴 삽입 후 커서와 preview가 같은 섹션을 가리킨다 |
| AC-2 | 패턴 카드는 44px 이상 클릭 영역을 가진다 |
| AC-3 | 카드 내부 텍스트가 작은 화면에서 넘치지 않는다 |
| AC-4 | 성공/실패 피드백이 1초 내에 보인다 |

## 개선안 4: 품질 패널을 문서 체크리스트로 강화

### 현재 문제

품질 패널은 점수와 이슈를 보여주지만, 처음 사용자는 점수가 왜 중요한지, 어떤 순서로 고쳐야 하는지 모를 수 있다.

### 제안

- 이슈를 `반드시 수정`, `권장`, `힌트`로 나눈다.
- 각 이슈 버튼은 원문 라인으로 이동하고, 수정 예시가 있으면 한 줄로 보여준다.
- empty state는 “위험 없음”뿐 아니라 “다음으로 해볼 것”을 제공한다.

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | 사용자는 가장 먼저 고칠 항목을 알 수 있다 |
| AC-2 | 클릭하면 editor line으로 이동한다 |
| AC-3 | render error는 원인과 복구 행동을 포함한다 |
| AC-4 | 품질 패널은 스크린 리더에 summary를 제공한다 |

상태: 2026-07-01에 Quality Panel summary를 `Fix first` 중심으로 바꾸고, 첫 이슈에 `먼저 수정` 배지를 추가했다. Render error에는 복구 행동 안내를 추가했다.

## 개선안 5: Source Graph를 독립 워크플로로 안내

### 현재 문제

Source Graph는 강력하지만 초기화, 갱신, 검색, 번들 스킬 설치가 한 덩어리로 느껴진다.

### 제안

Source Graph launcher에 상태 기반 CTA를 둔다.

| 상태 | CTA |
|---|---|
| DB 없음 | Source Graph 시작하기 |
| DB 있음, 오래됨 | 그래프 업데이트 |
| 결과 없음 | `.mpsignore` 확인 또는 샘플 검색 |
| markdown-workspace-search 미설치 | 상단 스킬 다운로드에서 번들 설치 |
| markdown-workspace-search 설치됨 | CLI 검색 예시 보기 |

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | DB 존재 여부와 마지막 업데이트 시간을 보여준다 |
| AC-2 | 빈 그래프 상태에 복구 행동이 있다 |
| AC-3 | 번들 스킬 설치 성공 후 어느 skill root가 갱신됐는지 보여준다 |

## 개선안 6: 스킬 설치 결과를 inventory로 보여주기

### 현재 문제

스킬 설치는 동작하지만, 사용자는 `.agents`, `.codex`, `.claude`, `.gemini` 중 어디에 무엇이 들어갔는지 확인하기 어렵다.

### 제안

`MD Studio: Install or Export Skills` 흐름 끝에 inventory summary를 보여준다.

```text
Installed
- .agents/skills/document-production-advisor
- .codex/skills/markdown-workspace-search

Skipped
- .claude/skills/md-presentation-composer already up to date

Next
- Restart Codex or reload VS Code if the target agent does not pick up new skills.
```

### Acceptance Criteria

| ID | 기준 |
|---|---|
| AC-1 | 설치/건너뜀/실패가 분리되어 표시된다 |
| AC-2 | 실패 항목은 원인과 복구 명령을 포함한다 |
| AC-3 | 전체 복사 대신 특정 agent 선택 흐름을 제공한다 |

## 비기능 요구사항

| 영역 | 요구사항 | 검증 방법 |
|---|---|---|
| 접근성 | 모든 icon-only action은 label/tooltip/aria label을 가진다 | 키보드 탐색, screen reader smoke |
| 터치/패널 | 주요 action target은 최소 44px 높이, 8px 간격 | 375px, narrow VS Code panel 확인 |
| 반응형 | 3-pane UI가 좁은 폭에서 순차/탭형으로 무너지며 horizontal scroll 없음 | 브라우저/VS Code webview 수동 확인 |
| 성능 | preview 입력 지연이 체감되지 않도록 render debounce 유지 | 큰 Markdown 샘플 입력 테스트 |
| 오류 복구 | export/render/source graph/skill install 실패는 다음 행동을 제시 | 실패 시나리오 수동 테스트 |

## 우선순위 작업 분해

### T1. 첫 실행 Start Here 상태 추가

- 목표: 첫 사용자에게 1차 성공 경로 제공
- 변경 예상 파일: `public/index.html`, `public/app.js`, `public/styles.css`, `vscode-extension/src/webview/*`
- 제외 범위: 새 렌더링 기능, 새 dependency
- 검증 명령: `npm run test:blog-embed`, 브라우저 수동 smoke
- Acceptance Criteria: Start Here action들이 키보드로 작동하고 preview/export 흐름으로 이어진다
- 리스크: 기존 3-pane 공간을 더 복잡하게 만들 수 있음

### T2. Export Target 라벨/설명 개선

- 목표: 사용자가 결과 형태를 이해하고 선택하게 만들기
- 변경 예상 파일: `vscode-extension/src/extension.ts`, `public/app.js` 또는 export UI 관련 파일
- 제외 범위: export engine 변경
- 검증 명령: `npm run test:blog-embed`, `cd vscode-extension && npm run build`
- Acceptance Criteria: 세 target의 용도와 다음 행동이 명확하다
- 리스크: 기존 문서/스크린샷의 명령명과 불일치할 수 있음
- 상태: 2026-07-01에 VS Code QuickPick 라벨, 완료 메시지, README 설명을 결과 중심 용어로 1차 반영

### T3. 패턴 카드 액션 강화

- 목표: 패턴을 읽는 카드에서 쓰는 카드로 전환
- 변경 예상 파일: `public/app.js`, `public/styles.css`
- 제외 범위: 패턴 문법 추가
- 검증 명령: 브라우저 수동 smoke, 관련 UI guard 추가
- Acceptance Criteria: 삽입 후 editor와 preview selection이 동기화된다
- 리스크: 카드 action이 많아져 sidebar가 복잡해질 수 있음
- 상태: 2026-07-01에 패턴 카드별 `삽입` 버튼을 추가하고 기존 `insertText()` 흐름으로 현재 커서에 snippet을 넣도록 1차 반영

### T4. Source Graph launcher 상태 기반 CTA

- 목표: 그래프 상태와 다음 행동을 명확히 표시
- 변경 예상 파일: `vscode-extension/src/commands/sourceGraph.ts`, `vscode-extension/src/providers/*`, `scripts/source-graph.mjs`
- 제외 범위: 그래프 DB schema 변경
- 검증 명령: `npm run test:source-graph`, `cd vscode-extension && npm run build`
- Acceptance Criteria: DB 없음/오래됨/빈 결과/markdown-workspace-search 설치 상태별 CTA 제공
- 리스크: 상태 판단 로직이 플랫폼별 경로 문제를 드러낼 수 있음
- 상태: 2026-07-01에 launcher 상단에 DB 있음/없음 상태 카드와 `Start Graph`/`Open Graph` 추천 액션을 1차 반영. Source Graph 스킬 설치는 상단 `MD Studio: Install or Export Skills` 번들 설치 흐름으로 통합.

### T5. Skill install inventory summary

- 목표: 스킬 설치 결과를 사용자가 확인 가능하게 만들기
- 변경 예상 파일: `vscode-extension/src/commands/exportSkillFolder.js`, `vscode-extension/src/utils/skillScanner.ts`
- 제외 범위: 중앙 Skill Bridge 동기화
- 검증 명령: `cd vscode-extension && npm run build`, 로컬 테스트 workspace에서 설치 smoke
- Acceptance Criteria: installed/skipped/failed/next action이 분리되어 보인다
- 리스크: 여러 agent 폴더의 ignore/권한 상태를 일관되게 표시해야 함
- 상태: 2026-07-01에 bundled/advanced skill update 성공 후 `Markdown Pattern Studio Skills` Output Channel에 Installed/Skipped/Failed/Next 요약을 표시하도록 1차 반영

### T6. Activity Bar 정보구조 정리

- 목표: MD Studio File Browser와 Source Graph가 Activity Bar에서 차지하는 공간을 줄이고, 초보자에게 하나의 Library 진입점처럼 보이게 만들기
- 변경 예상 파일: `vscode-extension/package.json`, `vscode-extension/src/providers/*`, `vscode-extension/src/commands/sourceGraph.ts`, `vscode-extension/README.md`
- 제외 범위: Source Graph 기능 삭제, DB schema 변경, File Browser 기능 축소
- 구현 방향: 기본 Activity Bar container는 `MD Studio Library` 하나로 합치고, 그 안에 `Files`와 `Source Graph` view를 함께 둔다. Graph는 독립 아이콘이 아니라 Library 내부의 고급 탐색 view/CTA로 둔다.
- 검증 명령: `cd vscode-extension && npm run build`, VS Code Extension Host에서 Activity Bar와 view/title command 확인
- Acceptance Criteria: Activity Bar 아이콘은 하나로 줄고, File Browser와 Source Graph 모두 기존 명령으로 접근 가능하다
- 롤백 방법: `package.json`의 `viewsContainers`/`views` 배치를 기존 두 container 구조로 되돌린다
- 리스크: 기존 사용자가 Source Graph 아이콘을 바로 찾던 습관이 깨질 수 있으므로 README와 view title action에 명확한 진입점을 남겨야 함
- 상태: 2026-07-01에 `MD Studio Library` 단일 Activity Bar container 안으로 `MD Studio Files`와 `Source Graph` view를 통합

### T7. 저장 버튼 피드백 보강

- 목표: 브라우저 스튜디오에서 MD/HTML 저장을 눌렀을 때 진행/성공/실패 상태를 즉시 알 수 있게 만들기
- 변경 예상 파일: `public/app.js`
- 제외 범위: export target 선택 UI, 파일명 picker, 저장 방식 변경
- 검증 명령: `node --check public/app.js`, `npm run test:blog-embed`
- Acceptance Criteria: MD 저장은 성공 상태를 보여주고, HTML 저장은 생성 중 비활성화와 성공/실패 피드백을 제공한다
- 상태: 2026-07-01에 `MD 저장` 성공 피드백과 `HTML 저장` pending/success/error 피드백을 1차 반영

### T8. Template Builder 버튼 톤 정리

- 목표: 브라우저 스튜디오 상단 도구 버튼에서 emoji 기반 structural icon을 제거해 도구 UI 톤을 맞춘다
- 변경 예상 파일: `public/index.html`, `public/styles.css`
- 제외 범위: Template Builder 기능/라우팅 변경, 새 icon library 도입
- 검증 명령: HTML/CSS 정적 확인, `npm run test:blog-embed`
- Acceptance Criteria: 버튼 라벨에서 emoji가 제거되고 기존 링크 동작은 유지된다
- 상태: 2026-07-01에 `🧩 Template Builder`를 `Template Builder`로 정리하고 inline link style을 CSS 클래스로 이동

## 비판적 리뷰

### Must Fix

- export target과 Source Graph/스킬 설치 흐름은 용어 중심에서 결과 중심으로 바꿔야 한다.
- 실패 메시지는 원인만 말하지 말고 복구 행동을 포함해야 한다.
- 브라우저 스튜디오의 emoji 기반 `Template Builder` 버튼은 전문 UI 기준에서는 icon/button 일관성이 약하다.

### Should Fix

- 브라우저 스튜디오 3-pane 구조는 좁은 화면에서 탭형 또는 순차형으로 전환하는 기준을 명시해야 한다.
- 품질 패널은 점수보다 “가장 먼저 고칠 것”을 더 강하게 보여줘야 한다.
- 스킬 설치 후 결과 inventory를 남겨야 에이전트 사용자 혼란이 줄어든다.

### Questions

- 첫 사용자에게 VS Code 확장을 우선 안내할지, 브라우저 스튜디오를 우선 안내할지 결정이 필요하다.
- Source Graph를 기본 onboarding에 포함할지, 고급 기능으로 분리할지 사용자 유형별 확인이 필요하다.
- Template Builder와 skill install은 같은 “AI 지원” 범주로 묶을지, 별도 명령으로 유지할지 결정이 필요하다.

### Go/No-go

Go. 다만 첫 PR은 T2처럼 작은 라벨/설명 개선으로 시작하고, T1/T3처럼 화면 구조에 영향을 주는 작업은 스크린샷 검증을 포함해야 한다.

## 구현 에이전트용 프롬프트

```text
이 저장소를 먼저 탐색해줘. 아직 코드를 수정하지 마.

목표 기능: Markdown Pattern Studio 사용성 개선 중 [Task ID]만 다룬다.
관련 문서:
- docs/planning/current-structure.md
- docs/planning/usability-improvement-plan.md

확인할 것:
1. 관련 파일과 책임
2. 기존 구현 패턴
3. 테스트 위치와 실행 명령
4. 변경 위험이 높은 영역
5. 구현 전에 확인해야 할 질문

탐색 후에는 구현 계획만 작성하고, 승인 전에는 코드를 수정하지 마.
```

승인 후 구현 프롬프트:

```text
승인된 계획의 [Task ID]만 구현해줘.

제약:
- 관련 없는 리팩터링 금지
- 새 라이브러리 추가 금지. 필요하면 먼저 이유를 설명하고 승인 요청
- 변경 파일 최소화
- 접근성 label, keyboard path, error/empty/success 상태 포함
- 완료 후 변경 파일, 실행한 검증 명령, 실패한 명령, 남은 리스크 보고
```
