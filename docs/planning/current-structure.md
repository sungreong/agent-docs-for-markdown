# Markdown Pattern Studio 현재 구조 문서

작성일: 2026-07-01

## 한 줄 정의

Markdown Pattern Studio는 Markdown 원문을 유지한 채 보고서, 슬라이드형 문서, 블로그 임베드 HTML, VS Code 미리보기, Source Graph, AI 스킬 배포까지 연결하는 Markdown-first 문서 제작 도구다.

## 내가 둔 가정

- 주 사용자는 Markdown으로 보고서, 발표 자료, 블로그 글, 기술 문서를 빠르게 만들고 싶은 작성자다.
- 주요 사용 경로는 VS Code 확장 사용이며, 웹 스튜디오는 개발/실험/독립 실행 보조 경로다.
- 이 문서는 현재 코드 구조를 설명하고, 구현 변경 없이 다음 개선 작업의 기준점을 제공한다.

## 제품 표면

| 표면 | 사용자 가치 | 주요 경로 |
|---|---|---|
| VS Code 확장 | Markdown 파일 탐색, 미리보기, HTML 변환, Source Graph, 스킬 설치를 한 곳에서 수행 | `vscode-extension/src`, `vscode-extension/package.json` |
| 브라우저 스튜디오 | Markdown 편집, 패턴 삽입, 실시간 렌더, 슬라이드/HTML 보기, Source Graph 오버레이 | `public/index.html`, `public/app.js`, `public/core/*` |
| CLI 렌더러 | Markdown을 standalone/blog-embed/fragment HTML로 변환 | `scripts/md-to-html.mjs` |
| Source Graph | Markdown 문서, 링크, 출처 관계를 SQLite/JSON 그래프로 색인 | `scripts/source-graph.mjs`, `public/core/source-graph*.js` |
| AI 스킬 번들 | 문서 제작/검토/검색용 에이전트 스킬을 배포 | `ai_skills/*`, `.agents/skills/*`, `.codex/skills/*` |
| 테스트 가드 | 렌더링, 블로그 임베드, Source Graph, VS Code 확장 흐름 회귀 방지 | `test/*.mjs` |

## 코드 구조

```text
markdown-pattern-studio/
  public/
    index.html                 # 브라우저 스튜디오 UI 골격
    app.js                     # 브라우저 스튜디오 상태, 이벤트, 렌더링 연결
    styles.css                 # 앱 UI 스타일
    document.css               # 렌더된 문서 스타일
    core/
      engine.js                # Markdown 파싱, 문서 모델, HTML 렌더링
      registry.js              # 템플릿 등록/조회
      snippets.js              # 빠른 삽입 스니펫
      quality.js               # 문서 품질 검사
      appearance.js            # viewer appearance 옵션
      brand-designs.js         # DESIGN.md/브랜드 디자인 프리셋
      export-standalone.js     # standalone HTML 조립
      source-graph.js          # 브라우저용 그래프 인덱싱/검색
      source-graph-sqlite.js   # SQLite 기반 그래프 연동
  scripts/
    md-to-html.mjs             # CLI 렌더러
    source-graph.mjs           # Source Graph CLI
    collect-design-md.mjs      # DESIGN.md 수집
    analyze-design-md.mjs      # 디자인 문서 분석
  vscode-extension/
    src/
      extension.ts             # 확장 활성화, 명령, 미리보기 세션 orchestration
      commands/                # 스킬 설치, Source Graph, Template Builder 등 명령
      fileBrowser/             # MD Studio File Browser 등록
      providers/               # 파일 트리, Git 상태, Source Graph launcher
      webview/                 # preview enhancement, status/template HTML
      utils/                   # 파일 판별, runtime, skill scan, ignore/localization
    public/                    # 확장에 번들되는 viewer/template-builder 자산
    scripts/                   # 확장에 번들되는 CLI
  ai_skills/                   # 배포 대상 AI 스킬 원본
  test/                        # Node 기반 회귀 가드
```

## 핵심 런타임 흐름

### 브라우저 스튜디오

1. `public/index.html`이 3-pane UI를 구성한다: 패턴 가이드, Markdown Editor, Live Preview.
2. `public/app.js`가 테마, 디자인, appearance, editor, preview mode, source graph 상태를 가진다.
3. 사용자가 Markdown을 열거나 편집하면 `parseMarkdownDocument`와 `renderDocument`가 문서 모델과 HTML을 만든다.
4. outline, 품질 패널, preview selection, slide mode, HTML source mode가 같은 모델에서 갱신된다.
5. 저장 시 Markdown 또는 standalone HTML을 다운로드한다.

### CLI 렌더링

1. `scripts/md-to-html.mjs`가 Markdown 입력과 옵션을 받는다.
2. `public/core/engine.js`와 `document.css`를 사용해 HTML을 만든다.
3. export target에 따라 standalone, blog embed, content fragment 형태로 내보낸다.
4. VS Code 확장은 이 CLI를 실행해 webview에 결과를 표시한다.

### VS Code 확장

1. `activate()`가 Markdown preview, refresh, transform, Source Graph, skill install, file browser 명령을 등록한다.
2. Markdown 파일을 열면 `queuePreview()`가 렌더링 작업을 직렬화한다.
3. CLI 실행 결과 HTML을 webview로 열고, webview 메시지를 통해 appearance, source open, link open, outline collapse 상태를 동기화한다.
4. 저장 시 auto refresh가 켜져 있으면 현재 커서 섹션을 계산해 preview 위치를 맞춘다.
5. File Browser는 workspace Markdown/HTML/추가 확장자를 보여주고, pin/recent/filter/sort/focus/hidden 상태를 관리한다.

### Source Graph

1. CLI 또는 확장 명령으로 `.mps/source-graph.sqlite`를 초기화/갱신한다.
2. Markdown 문서, heading, link, citation, backlink 정보를 색인한다.
3. VS Code webview와 브라우저 스튜디오 overlay에서 검색/그래프 탐색을 제공한다.
4. 번들 스킬 설치 흐름은 `markdown-workspace-search`를 워크스페이스 skill root에 함께 복사해 CLI 검색 흐름을 연결한다.

### AI 스킬 배포

1. `ai_skills`와 확장 번들에 문서 제작용 스킬을 둔다.
2. VS Code 명령 `MD Studio: Install or Export Skills`가 workspace agent 폴더에 복사하거나 ZIP으로 내보낸다.
3. 현재 workspace에는 `.agents`, `.codex`, `.claude`, `.gemini` 계열 스킬 폴더가 존재한다.

## 사용자 여정

### 여정 A: VS Code에서 Markdown을 HTML 문서로 변환

1. 사용자가 Markdown workspace를 연다.
2. MD Studio File Browser에서 `.md` 파일을 클릭한다.
3. Preview가 열리고 저장 시 자동 갱신된다.
4. 사용자는 viewer style, outline, slide/stack mode로 결과를 확인한다.
5. `Transform Markdown to Styled HTML`에서 standalone/blog embed/fragment 중 하나를 선택한다.

완료 조건:

- 사용자가 원본 Markdown을 잃지 않는다.
- preview가 저장 후 현재 섹션 근처로 동기화된다.
- export target 차이를 선택 전에 이해할 수 있다.

### 여정 B: 브라우저 스튜디오에서 빠르게 초안 제작

1. 사용자가 샘플 문서 또는 로컬 Markdown을 연다.
2. 빠른 삽입과 패턴 가이드를 참고해 섹션, KPI, 표, callout을 추가한다.
3. Live Preview에서 rendered/slides/html을 전환한다.
4. 품질 패널에서 구조/이미지/표 위험을 확인한다.
5. Markdown 또는 HTML로 저장한다.

완료 조건:

- 첫 화면에서 “무엇을 어디에 쓰면 되는지”가 30초 안에 드러난다.
- 초보 사용자가 패턴 문법을 외우지 않고 삽입할 수 있다.
- 오류나 품질 경고가 수정 위치로 이동시킨다.

### 여정 C: 큰 Markdown 워크스페이스에서 출처 관계 탐색

1. 사용자가 Source Graph workspace를 초기화한다.
2. `.mpsignore`로 제외할 파일을 정리한다.
3. Graph webview에서 관련 문서, inbound/outbound link, citation을 확인한다.
4. 필요하면 `MD Studio: Install or Export Skills`에서 번들 스킬을 설치해 에이전트가 CLI로 같은 그래프를 검색하도록 한다.

완료 조건:

- 초기화 전/후 상태가 명확하다.
- 그래프가 비어 있거나 오래되었을 때 복구 경로가 보인다.
- 에이전트 설정이 성공했는지 진단할 수 있다.

## 현재 강점

- Markdown 원문을 중심에 두고 preview/export/graph/skill이 연결되어 있다.
- VS Code 확장에 실제 반복 사용 기능이 많다: file browser, auto refresh, export target, source graph, skill install.
- Node 기반 회귀 테스트가 문서 렌더링과 확장 동작을 넓게 방어한다.
- `public/core`가 브라우저, CLI, 확장 번들 사이에서 재사용되는 구조라 기능 확장이 비교적 직접적이다.

## 구조상 주의할 점

- `public/app.js`와 `vscode-extension/src/extension.ts`가 많은 책임을 갖고 있어 새 UX를 넣을 때 변경 충돌이 생기기 쉽다.
- 브라우저 스튜디오와 VS Code preview가 비슷한 viewer 개념을 갖지만 상태 저장 위치가 다르다.
- Source Graph, skill install, export target은 강력하지만 처음 쓰는 사용자가 기능 간 관계를 이해하기 어렵다.
- `.agents`, `.codex`, `.gemini` 등 로컬 에이전트 폴더는 Git ignore 대상이라 문서에는 “로컬 작업 자산”으로 설명해야 한다.

## 테스트와 검증 명령

```bash
npm run test:blog-embed
npm run test:document-advisor
npm run test:source-graph
node test/vscode-editor-first-guard.mjs
cd vscode-extension && npm run build
```

## 다음 문서

사용자가 더 쉽게 쓰게 만들기 위한 제품/UX 개선안은 `docs/planning/usability-improvement-plan.md`에 분리했다.
