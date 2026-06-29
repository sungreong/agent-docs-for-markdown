# Markdown Pattern Studio

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Markdown%20Pattern%20Studio%20Preview-0078d4?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-pattern-studio-preview)

English documentation is available in [README.md](README.md).

Markdown 중심으로 문서를 작성하고, 템플릿/속성 문법으로 보고서·슬라이드 스타일 HTML을 빠르게 렌더링하는 도구입니다.

이 문서는 상세 한국어 가이드입니다. 루트 [README.md](README.md)는 가벼운 프로젝트 소개와 문서 링크 중심으로 유지하고, 세부 사용법·VS Code 확장·Source Graph·AI Skills 설명은 이 파일과 관련 문서로 나눠 관리합니다.

변경 이력은 별도 문서인 [CHANGELOG.md](CHANGELOG.md)에서 관리합니다.

## 추천: VS Code 확장으로 사용

일반 사용자는 VS Code 확장으로 쓰는 흐름을 추천합니다. 저장소를 clone하지 않아도 Markdown 파일을 열고, 미리보기, HTML export, Source Graph, AI 스킬 다운로드를 VS Code 안에서 처리할 수 있습니다.

설치:

```text
ext install datanewbie-labs.markdown-pattern-studio-preview
```

기본 흐름:

1. VS Code에서 Markdown workspace를 엽니다.
2. Activity Bar의 MD Studio 아이콘 또는 Command Palette에서 `Markdown Studio: Open Preview`를 실행합니다.
3. Markdown을 저장하면 Preview가 자동 갱신됩니다.
4. `MD Studio: Transform Markdown to Styled HTML`로 standalone/blog-embed/fragment HTML을 export합니다.
5. `MD Studio: Open Source Graph`로 문서 링크와 관련 문서를 확인합니다.
6. `MD Studio: Download Skill Folder`로 에이전트용 문서 작성 스킬을 내려받거나 workspace에 업데이트합니다.

자세한 확장 사용법은 [vscode-extension/README.md](vscode-extension/README.md)와 [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md)를 참고하세요.

## AI 에이전트로 문서 만들기

VS Code 확장에서 스킬을 다운로드하거나 workspace 스킬 폴더로 업데이트한 뒤, Claude/Codex/Agents 같은 에이전트에게 아래처럼 요청하면 Markdown Pattern Studio 문서 구조에 맞춰 초안을 만들 수 있습니다. 이 기능도 VS Code 확장 사용 흐름에 포함되어 있으므로, 처음에는 clone보다 VS Code 확장 방식으로 시작하는 것을 권장합니다.

### 1. 스킬 다운로드 또는 업데이트

1. VS Code에서 Markdown workspace를 엽니다.
2. Command Palette에서 `MD Studio: Download Skill Folder`를 실행합니다.
3. 사용할 source를 선택합니다.
   - `Bundled Claude`: Claude용 `.claude/skills`에 맞는 스킬
   - `Bundled Agents`: `.agents/skills`에 맞는 스킬
   - `Bundled Codex`: `.codex/skills`에 맞는 스킬
   - `Bundled Gemini`: `.gemini/skills`에 맞는 스킬(번들 source가 있을 때)
   - `Bundled Cursor`: `.cursor/skills`에 맞는 스킬(번들 source가 있을 때)
   - `Workspace`: 설정된 `mdStudioPreview.skillsDir` 기준 스킬
4. ZIP 저장, 매칭 폴더 업데이트, 또는 선택/전체 스킬을 모든 에이전트 폴더에 반영하는 액션을 선택합니다. 대상 폴더가 없으면 자동으로 생성됩니다.
5. 문서 제작용으로는 보통 `md-presentation-composer`와 `document-production-advisor`를 함께 사용합니다.

### 2. 에이전트에게 입력할 프롬프트

새 문서를 만들 때:

```text
md-presentation-composer와 document-production-advisor를 사용해서
아래 내용을 Markdown Pattern Studio 문서로 만들어줘.

목적: 임원 보고용 8페이지 요약 보고서
톤: 전문적이고 간결하게
출력: Markdown만
조건:
- frontmatter에 title, theme, intent, appearance를 넣어줘
- 페이지는 {: .page-break }로 나눠줘
- KPI는 .stats 또는 .metrics-dashboard로 구성해줘
- 마지막에 렌더링/가독성 체크리스트를 간단히 붙여줘

내용:
[여기에 원문, 회의록, 기획 메모, 표 데이터 등을 붙여넣기]
```

기존 Markdown을 재구성할 때:

```text
md-presentation-composer를 사용해서 @파일명.md를 발표/보고서 형태로 재구성해줘.
먼저 문서 목적, 추천 theme/intent, 페이지 구성안만 보여주고,
승인 후 최종 Markdown을 만들어줘.
```

품질 점검까지 맡길 때:

```text
document-production-advisor를 사용해서 이 Markdown이
HTML export와 blog-embed export에서 깨지지 않을지 점검해줘.
표, 카드, 다크 슬라이드 대비, 모바일 stack, 이미지 경로를 확인하고
수정이 필요한 부분은 패치 형태로 제안해줘.
```

### 3. 어떤 스킬을 쓰면 좋은가

- `md-presentation-composer`: 원문을 보고서, 제안서, 기술 문서, 튜토리얼, 발표형 Markdown으로 재구성할 때 사용합니다.
- `document-production-advisor`: 요청 충족 여부, 렌더 UX, HTML/blog/DOCX/PPTX식 handoff 안정성을 점검할 때 사용합니다.
- `source-graph-search`: 여러 Markdown 파일 사이의 관련 문서, backlink, citation, neighbor를 찾아야 할 때 사용합니다.

## 일반/개발: clone해서 사용

clone해서 사용하는 방식은 웹 스튜디오를 직접 띄우거나, CLI 변환을 자동화하거나, 확장/렌더러 개발을 할 때 적합합니다.

요구사항: Node.js 18+

```bash
git clone https://github.com/sungreong/md-pattern-studio.git
cd md-pattern-studio
npm install
npm start
```

Windows에서는 이미 clone한 폴더에서 `dev.bat`을 더블클릭해 실행할 수도 있습니다.

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3188
```

CLI만 사용할 때:

```bash
npm run md2html -- test/notes.md
npm run md2html -- test/notes.md --out test/notes.blog-embed.html --export-target blog-embed
```

## 핵심 기능

- VS Code 확장 기반 Markdown 미리보기, export, Source Graph, AI 스킬 다운로드
- clone 후 웹 스튜디오에서 Markdown 편집 + 실시간 HTML 미리보기
- 섹션 템플릿 클래스 14종 (`.cover`, `.dark`, `.half-bleed`, `.icon-list`, `.card`, `.two-column`, `.three-column`, `.stats`, `.compare`, `.timeline`, `.agenda`, `.message`, `.spotlight`, `.quote-slide`)
- 블록 속성 문법 `{: ...}` 지원
- 페이지 분리(`{: .page-break}`) 기반 Slides 모드
- CLI 변환(`npm run md2html -- ...`)
- **16종 네임드 팔레트** — 각 테마에 컬러 + 폰트 페어링 내장
- **70개 DESIGN.md 인사이트 라이브러리** — 회사별 디자인 문서를 수집/분석해 PPT형 Markdown의 디자인 방향으로 활용
- **`intent:` 프론트매터** — `pitch / report / reference / narrative` 문서 목적 선언
- Mermaid 렌더링 지원
- standalone HTML의 로컬 이미지 자동 Base64 내장 및 누락 이미지 fallback
- standalone HTML 아웃라인/코드 복사 버튼/Style 메뉴/Fill 줌 지원
- **Template Builder**: 웹 UI에서 섹션 템플릿을 시각적으로 선택·삽입하는 보조 패널
- **문서 외형 프리셋**: `Default`, `Clean`, `Flat`, `Reader`, `Print`와 배경/모서리/프레임/뷰어 크롬 옵션 지원
- `<details>/<summary>` 호환 변환: 기존 raw HTML details는 정적 note callout으로 보존하고, 새 문서에는 Markdown/callout/template 사용을 안내
- **VS Code File Browser**: 폴더 FOCUS, 추가 확장자 표시, Pinned/Recent/Hidden, 파일 검색·정렬·필터 지원
- **Blog Embed HTML export**: Tistory, WordPress, Velog 같은 기존 사이트 본문에 복붙할 때 fixed 뷰어 UI와 전역 CSS 충돌을 줄이는 scoped fragment 출력 지원

## 스크린샷으로 보는 흐름

### 1. VS Code 확장 워크플로

![VS Code Extension Preview 예시](assets/images/extension_example.png)

MD Studio File Browser에서 폴더 FOCUS, 정렬/필터, Markdown 미리보기, Outline 이동, HTML export를 VS Code 안에서 바로 처리합니다.

### 2. 브라우저 스튜디오

![Markdown Pattern Studio 전체 화면](assets/images/web.png)

패턴 가이드, Markdown Editor, Live Preview, Template Builder, 외형 설정, 저장/export 동작을 한 화면에서 다룹니다.

### 3. Standalone HTML 결과물

![Standalone HTML 결과 화면](assets/images/result.png)

Standalone export는 Outline, 줌, Slide/Stack 전환, 코드 복사, 로컬 이미지 내장을 포함해 HTML 파일 하나로 공유하기 좋게 만듭니다.

### 4. VS Code Extension 0.1.34 업데이트

![VS Code Extension 0.1.34 업데이트 화면](assets/images/vscode-extension-0.1.34-updates.png)

0.1.32 이후 Source Graph, Codex MCP 설정 명령, Blog Embed/Fragment export, 렌더 품질 가드, MD 책 아이콘이 추가되었습니다.

### 5. Source Graph Webview

![Source Graph Webview 화면](assets/images/source-graph-vsix-preview.png)

워크스페이스 Markdown 문서, heading, link, citation, related neighbor를 로컬 SQLite 그래프로 인덱싱하고 VS Code 안에서 시각적으로 탐색합니다.

## 웹 스튜디오 화면 구성과 사용 방법

clone해서 웹 스튜디오를 직접 실행할 때는 아래 순서로 사용하면 됩니다.

1. 왼쪽 `패턴 가이드`에서 문법을 확인하고, `빠른 삽입` 버튼으로 자주 쓰는 블록을 넣습니다.
2. 가운데 `Markdown Editor`에서 문서를 작성합니다.
3. 오른쪽 `Live Preview`에서 즉시 결과를 확인합니다.
4. 상단 버튼으로 필요 작업을 실행합니다.
   - `Style`: 문서 외형 프리셋, 배경, 모서리, 프레임, 뷰어 크롬 조정
   - `샘플`: 예제 문서 로드
   - `MD 열기`: 로컬 Markdown 불러오기
   - `MD 저장`: 현재 Markdown 저장
   - `HTML 저장`: 렌더링 결과를 HTML로 저장

프리뷰 모드:

- `Rendered`: 보고서형 문서 보기
- `Slides`: 페이지 분리(`{: .page-break}`) 기준 슬라이드 보기
- `HTML`: 렌더된 원본 HTML 확인

## 템플릿/속성 문법

### 1) Front Matter

```yaml
---
title: 2026년 3월 운영 보고서
theme: midnight        # 16종 팔레트 중 선택
design: stripe         # 선택: 수집된 DESIGN.md 브랜드 slug
intent: pitch          # report | pitch | reference | narrative
appearance: clean      # default | clean | flat | reader | print
appearanceBackground: plain      # default | plain | transparent
appearanceRadius: none           # default | soft | none
appearanceFrame: lines           # default | lines | none
viewerChrome: minimal            # full | minimal | hidden
mode: web
toc: true
tocDepth: 3
pageWidth: 1120px
pageHeight: 720px
---
```

`intent:` 값별 동작:

| 값 | 용도 |
|----|------|
| `report` | 보고서 — 밀도 높은 레이아웃, 전체 목차 |
| `pitch` | 제안서/발표 — 큰 제목, 굵은 callout, 비주얼 템플릿 |
| `reference` | 문서/위키 — 탐색 우선, 정보 밀도 최적화 |
| `narrative` | 튜토리얼/에세이 — 여백 확보, 읽기 흐름 중심 |

외형 옵션은 `theme`/`design` 위에 얹는 표시 계층입니다. Markdown 내용은 그대로 두고, 리뷰·공유·인쇄 목적에 맞게 프레임 밀도와 뷰어 UI만 바꿀 수 있습니다.

| 키 | 값 |
|----|----|
| `appearance` | `default`, `clean`, `flat`, `reader`, `print` |
| `appearanceBackground` | `default`, `plain`, `transparent` |
| `appearanceRadius` | `default`, `soft`, `none` |
| `appearanceFrame` | `default`, `lines`, `none` |
| `viewerChrome` | `full`, `minimal`, `hidden` |

### 2) 섹션 속성 (heading 뒤 `{...}`)

```markdown
# 보고서 제목 {#cover .cover eyebrow="Monthly Report"}
## 핵심 요약 {#summary .two-column}
### KPI {#kpi .stats}
## 부록 {#appendix .card}
```

#### 신규 템플릿 3종

**`.dark` — 다크 슬라이드** (샌드위치 구조: 다크 커버 → 라이트 본문 → 다크 클로즈)

```markdown
# 제목 {#cover .cover .dark eyebrow="발표자료"}

## 마무리 {: .dark}
문의: hello@company.com
```

**`.half-bleed` — 하프 블리드 이미지** (이미지가 슬라이드 절반을 꽉 채움)

```markdown
## 제품 소개 {: .half-bleed side="right"}

![스크린샷](./public/examples/assets/local-kpi-card.svg)

이미지가 오른쪽 절반을 채우고, 이 텍스트는 왼쪽에 위치합니다.
```

**`.icon-list` — 아이콘 리스트** (`아이콘 | 제목 | 설명` 파이프 형식)

```markdown
## 주요 기능 {: .icon-list}

- 🚀 | 빠른 배포 | 수일 내 기능 출시
- 🔒 | 기본 보안 | Zero-trust 아키텍처 내장
- 📊 | 데이터 기반 | 실시간 분석 지원
```

#### 템플릿 선택 기준 (항목 수 기준)

| 항목 수 | 추천 | 사용 금지 |
|--------|------|---------|
| 2개 | `.compare` / `.two-column` | — |
| **3개** | **`.three-column`** 또는 `.timeline`(순서 있는 경우) | **`.compare`** — 카드 하나 고립 |
| 4개+ | `.icon-list`, `.stats`, `.agenda` | `.compare`, `.three-column` |
| 순서·단계 의미 있음 | `.timeline` (개수 무관) | `.compare` |

#### 표현 기법 유틸리티

아래 클래스는 새 문법 없이 현재 heading/list/image/table 속성 문법으로 바로 사용할 수 있습니다.

섹션 클래스:

- `.safe-zone`: 슬라이드/배너의 중요한 내용을 중앙 읽기 영역에 유지
- `.problem-statement`: 문제 제기 슬라이드용 accent 처리
- `.big-number-hero`: 단일 수치나 핵심 문장을 큰 hero 타이포로 강조
- `.feature-grid`: 리스트를 반응형 기능 카드 grid로 표시
- `.metrics-dashboard`: 리스트를 KPI 카드처럼 표시
- `.contrast-pair`: Before/After, Old/New 같은 쌍 비교를 2열로 표시하고 좁은 화면에서는 stack 처리

블록 클래스:

- `.gradient-number`: 숫자/강조 문장에 accent gradient 적용
- `.oversized`: 큰 타이포 문장
- `.screenshot-shadow`: 제품/결과 스크린샷 이미지에 깊은 그림자 적용
- 표의 `.contrast-pair`: 비교 테이블의 첫 열/마지막 열을 대비 처리

```markdown
## 지연 비용 {: .problem-statement}

느린 handoff는 매번 리뷰 루프를 하나씩 늘립니다. 해결책은 보이고 테스트 가능한 workflow입니다.

## 42% {: .big-number-hero}

구조화된 Markdown으로 전환한 뒤 rewrite cycle이 줄었습니다.

## Capability Map {: .feature-grid}

- VS Code Preview
- Blog-safe HTML export
- Stack-first mobile reading
```

### 3) 블록 속성 (`{: ...}`)

```markdown
| 항목 | 목표 | 실적 |
| --- | ---: | ---: |
| 매출 | 100 | 124 |
{: .zebra .bordered .compact caption="월별 성과 비교" emphasis="last-col"}
```

표의 `caption`은 표 안의 병합 헤더가 아니라 표 위의 짧은 맥락 설명으로 렌더링됩니다. 컬럼 헤더에는 실제 비교 축만 두고, 긴 설명은 섹션 제목이나 본문 lead로 분리하는 것을 권장합니다.

```markdown
![차트](https://dummyimage.com/1200x520/e5eefc/1f3b7a.png&text=Chart)
{: width="88%" align="center" caption="이미지 캡션"}
```

### 4) Callout

```markdown
> [!INFO] 메모
> 강조가 필요한 내용을 표시합니다.
```

## 페이지 분리 / Slides 모드

아래 마커를 사용하면 렌더링 결과가 다음 페이지로 분리됩니다.

```markdown
---
{: .page-break}
```

`page-break`가 2개 이상이면 앱/standalone HTML에서 Slides 탐색(Prev/Next, 키보드) 모드를 사용할 수 있습니다.

## Template Builder

웹 UI 우측 상단의 `Template Builder` 버튼(또는 VS Code Extension 내 패널)을 열면, 섹션 템플릿을 시각적으로 선택해 에디터에 바로 삽입할 수 있습니다.

- 커버, 두 컬럼, 세 컬럼, Stats, 카드 등 주요 템플릿을 버튼 클릭으로 삽입
- 삽입 위치는 현재 커서 기준 섹션 직후로 자동 설정
- VS Code Extension에서는 Webview 내 패널로 제공되며 저장 시 에디터에 반영

## clone/CLI: Markdown -> HTML

```bash
npm run md2html -- <input.md>
```

예시:

```bash
# 기본 출력: 입력 파일과 같은 경로에 .html
npm run md2html -- test/notes.md

# 출력 경로/테마 지정
npm run md2html -- test/notes.md --out test/notes.cli.html --theme report --standalone

# DESIGN.md 브랜드 방향 적용
npm run md2html -- test/notes.md --out test/notes.vercel.html --design vercel --intent pitch --standalone

# 외형 프리셋/뷰어 크롬 지정
npm run md2html -- test/notes.md --appearance flat --appearance-radius none --viewer-chrome hidden --standalone

# Tistory/블로그 본문 복붙용 scoped fragment
npm run md2html -- test/notes.md --out test/notes.blog-embed.html --export-target blog-embed

# 외부 시스템이 자체 script/control을 제공할 때 쓰는 content fragment
npm run md2html -- test/notes.md --out test/notes.fragment.html --export-target fragment
```

옵션:

- `--out`, `-o`: 출력 HTML 경로
- `--theme`: 팔레트 지정 (아래 16종 참고)
- `--design`: DESIGN.md 브랜드 preset 지정 (`vercel`, `stripe`, `airbnb` 등)
- `--intent`: `report | pitch | reference | narrative`
- `--appearance`: 외형 프리셋 (`default | clean | flat | reader | print`)
- `--appearance-background`: 배경 처리 (`default | plain | transparent`)
- `--appearance-radius`: 모서리 처리 (`default | soft | none`)
- `--appearance-frame`: 프레임 처리 (`default | lines | none`)
- `--viewer-chrome`: standalone 뷰어 UI 노출 수준 (`full | minimal | hidden`)
- `--export-target`: 출력 대상 (`standalone | blog-embed | fragment`)
- `--mode`: 렌더 모드 (`web` 등)
- `--standalone` / `--no-standalone`: standalone HTML 셸 포함 여부
- `--base-dir <path>`: 상대 경로 자산 해석 기준 디렉터리
- `--embed-local-images` / `--no-embed-local-images`: 로컬 이미지를 HTML에 Base64로 내장할지 여부. standalone 출력은 기본적으로 내장합니다.
- `--mermaid` / `--no-mermaid`: Mermaid 강제 on/off

### HTML Export Target

| Target | 용도 |
|--------|------|
| `standalone` | HTML 파일을 브라우저에서 직접 열거나 공유할 때 사용합니다. Style, Outline, Slide/Stack, Zoom 같은 viewer chrome이 포함됩니다. |
| `blog-embed` | Tistory/WordPress/Velog 등 기존 사이트 본문에 붙여넣을 때 사용합니다. `html/body` 없이 fragment로 출력하고, CSS를 `.mps-embed-root` 아래로 scope하며, fixed viewer chrome을 제거하고 paginated slide를 stack article처럼 보여줍니다. |
| `fragment` | 외부 시스템이 자체 script/control을 제공할 때 사용합니다. scoped CSS와 문서 HTML만 포함하고 viewer script는 넣지 않습니다. |

`blog-embed`는 블로그 스킨의 사이드바, 북마크 버튼, 검색/상단 이동 버튼, 모바일 플로팅 버튼과 standalone HTML의 fixed 컨트롤이 겹치는 상황을 피하기 위한 출력 모드입니다.

### 팔레트(테마) 16종

| 테마 | 성격 | 주 색상 | 폰트 페어링 |
|------|------|---------|-----------|
| `default` | 블루 기본 | `#5e6ad2` | 시스템 UI |
| `report` | 전문 블루 | `#3a63d6` | 시스템 UI |
| `slate` | 다크 프리미엄 | `#8cb4ff` | 시스템 UI |
| `paper` | 따뜻한 문서 | `#b26a2f` | 시스템 UI |
| `forest` | 자연 그린 | `#2d8a57` | 시스템 UI |
| `sunset` | 핑크/웜 | `#c04878` | 시스템 UI |
| `ocean` | 오션 블루 | `#2f74c8` | 시스템 UI |
| `mono` | 중성 미니멀 | `#424242` | 시스템 UI |
| `midnight` | 네이비 임원용 | `#1e2761` | Georgia / Calibri |
| `coral` | 코랄 볼드 | `#f96167` | Arial Black / Arial |
| `terracotta` | 따뜻한 흙 | `#b85042` | Cambria / Calibri |
| `charcoal` | 다크 미니멀 | `#36454f` | Trebuchet MS / Calibri |
| `teal-trust` | 차분한 틸 | `#028090` | Trebuchet MS / Calibri |
| `berry` | 리치 베리 | `#6d2e46` | Palatino / Garamond |
| `cherry` | 볼드 체리 | `#990011` | Impact / Arial |
| `sage` | 차분한 세이지 | `#84b59f` | Calibri |

> **팔레트 선택 원칙 (PPTX Skill 기준):** 하나의 색이 시각적 비중의 60–70%를 차지해야 합니다. 주제와 무관한 무난한 파란색 대신, 콘텐츠 성격에 맞는 팔레트를 선택하세요.

참고: 브라우저 보안 정책 때문에 `MD 열기`에서 파일의 실제 절대 경로를 제공하지 않는 환경이 있습니다. 이 경우 앱 미리보기는 원본 상대경로를 유지하고, CLI(`--base-dir`)를 사용하면 경로 해석을 강제할 수 있습니다. standalone CLI 출력은 로컬 이미지를 기본적으로 Base64로 내장하므로 HTML 파일만 옮겨도 이미지가 유지됩니다. 단, 큰 이미지는 HTML 파일 크기를 크게 만들 수 있고, 원격 이미지는 URL을 그대로 유지합니다. 로컬 이미지를 찾지 못하면 변환 품질 안내와 이미지 fallback 영역을 표시합니다.

로컬 이미지 내장 동작 검증:

```bash
npm run test:embed-images
```

## VS Code 확장 상세 기능

`vscode-extension/` 폴더에는 CLI 렌더 결과를 VS Code Webview에서 보여주는 확장 소스가 포함되어 있습니다.

번들 다운로드 가능 skill:

- `md-presentation-composer`: Markdown을 보고서, 제안서, 기술 문서, 튜토리얼, 발표형 문서로 재구성
- `document-production-advisor`: 사용자 요청을 acceptance criteria와 trace로 정리하고 HTML/blog/DOCX/PPTX식 handoff, 렌더 UX, 표현 클래스, heading/list/table/image 구조, export 안정성을 점검하며 렌더 테스트 예제를 포함

`MD Studio: Download Skill Folder`는 스킬 ZIP을 저장하거나 현재 workspace의 스킬 폴더를 업데이트합니다. 선택한 source와 매칭되는 폴더만 업데이트할 수도 있고, 선택/전체 스킬을 `.claude/skills`, `.agents/skills`, `.codex/skills`, `.gemini/skills`, `.cursor/skills` 같은 알려진 에이전트 폴더 전체에 한 번에 반영할 수도 있습니다. 대상 폴더가 없으면 자동으로 생성됩니다. ZIP을 Claude, Codex, 또는 호환되는 다른 에이전트에게 전달하면, 해당 에이전트가 같은 Markdown Pattern Studio 구조, 문서 디자인 클래스, export 규칙, 렌더 검증 체크리스트를 기준으로 문서를 작성하도록 지시할 수 있습니다.

확장 동작 예시 화면:

![VS Code Extension Preview 예시](assets/images/extension_example.png)

이 화면은 VS Code에서 Markdown을 저장했을 때, 확장이 CLI 렌더링 결과를 Webview로 보여주고 Outline/페이지 네비게이션을 제공하는 상태입니다.

릴리스별 변경 이력은 [CHANGELOG.md](CHANGELOG.md)에서 따로 관리합니다.

사용 흐름:

1. VS Code에서 Markdown 파일을 연 뒤 `Markdown Studio: Open Preview` 실행 (또는 Activity Bar의 책 아이콘 클릭)
2. 문서를 수정하고 저장(`Ctrl+S`)하면 자동 렌더링/갱신
3. 우측 Outline에서 섹션 이동, 하단 `Prev/Next`로 페이지 이동, `Stack`으로 문서형 보기 전환
4. `Fit`, `+`, `-` 버튼으로 현재 패널 크기에 맞춰 Slide/Stack 배율 조정

주요 동작:

- 명령: `Markdown Studio: Open Preview`
- 명령: `Markdown Studio: Refresh Preview`
- Markdown 저장 시 자동 갱신 (`mdStudioPreview.autoOnSave=true`)
- Markdown 저장(`Ctrl+S`) 시 커서 기준 섹션으로 Preview 동기화 (`mdStudioPreview.cursorSyncOnSave=true`)
- `file://` 자산 링크를 Webview URI로 변환
- **워크스페이스 외부 파일 지원**: 현재 워크스페이스에 없는 `.md` 파일도 번들 CLI로 바로 미리보기 가능
- **반응형 레이아웃**: Webview 패널이 좁아도 슬라이드·Outline이 실제 너비에 맞게 자동 조정
- **Slide/Stack Zoom**: 5% 단위 확대/축소, Fit은 화면 여유 공간을 사용해 100% 이상 확대 가능

### MD Studio File Browser (Activity Bar)

- Activity Bar의 **책 아이콘**을 클릭하면 워크스페이스의 Markdown 파일이 폴더 트리로 표시됨
- **파일 클릭** → 단일 Reader 패널에서 즉시 미리보기 (이전 패널 자동 교체)
- **우클릭 → Open in New Panel** → 기존 패널 유지하며 새 패널로 열기 (여러 파일 동시 비교)
- **우클릭 → Open in Editor** → 파일을 일반 VS Code 에디터에서 열기
- **우클릭 → Hide from Browser** → 관심 없는 파일/폴더를 워크스페이스별로 숨김
- **우클릭 폴더 → FOCUS** → 해당 폴더 아래 파일만 MD Studio File Browser에서 보기
- **우클릭 → Copy Path / Copy Relative Path / Copy Name** → 파일과 폴더 경로/이름 복사
- Command Palette의 **MD Studio: Open in Viewer**는 현재 열린 Markdown 파일을 대상으로 실행되며, 대상이 없으면 안내 메시지로 종료
- **검색 아이콘(🔍)** → 파일명·경로 기준 QuickPick 검색
- **필터 아이콘** → 전체, Pinned, Recent, 오래 안 고침, 긴 문서, 큰 파일 보기
- **정렬 아이콘** → 이름, 수정일, 생성일, 파일 크기, 문서 길이 기준 정렬
- **확장자 아이콘** → Markdown 외에 표시할 추가 확장자 선택 (`txt`, `html`, `json` 등)
- **눈 아이콘** → 숨김 항목 관리 및 숨김 전체 해제
- **Pinned / Recent 가상 섹션**으로 자주 보는 문서와 최근 문서를 빠르게 접근
- 파일 추가/삭제/수정 시 트리 자동 갱신 (300ms 디바운스)
- `Ctrl+S` 저장 시 사이드바 선택이 현재 프리뷰 파일로 자동 동기화

### Source Graph / MCP

- 명령: `MD Studio: Open Source Graph`
- 명령: `MD Studio: Initialize Source Graph Workspace`
- 명령: `MD Studio: Update Source Graph Index`
- 명령: `MD Studio: Search Source Graph`
- 명령: `MD Studio: Edit Source Ignore`
- 명령: `MD Studio: Install Codex Source Graph MCP`
- 명령: `MD Studio: Check Codex Source Graph MCP Status`
- 명령: `MD Studio: Remove Codex Source Graph MCP`
- 명령: `MD Studio: Copy Codex Source Graph MCP Config`
- 워크스페이스 Markdown 파일을 `.mps/source-graph.sqlite`에 인덱싱합니다. 이 DB는 `codegraph init`처럼 프로젝트/워크스페이스마다 따로 생기는 로컬 SQLite 인덱스입니다.
- DB는 dependency-free JSON이지만 `documents`, `headings`, `links`, `citations`, `searchIndex` 테이블과 graph `nodes/edges`를 가진 SQLite형 구조입니다.
- `MD Studio: Edit Source Ignore`로 워크스페이스 루트의 `.mpsignore`를 만들거나 편집할 수 있습니다. 이 패턴은 Source Graph 인덱스와 MD Studio File Browser 목록에서 모두 제외됩니다.
- 그래프 패널을 열면 인덱스를 먼저 갱신합니다. 기존 Markdown 파일 내용만 바뀌면 해당 문서 row만 교체하고 edge를 재계산하며, 파일 생성/삭제 또는 `.mpsignore` 변경은 전체 재빌드합니다.

`.mpsignore` 예시:

```gitignore
.agents/**
.claude/**
raw/**
**/drafts/**
*.draft.md
```

CLI / MCP:

```bash
npm run source-graph:update
node scripts/source-graph.mjs update-file --path README.md
node scripts/source-graph.mjs search --query "DESIGN.md"
node scripts/source-graph.mjs related --path README.md
node scripts/source-graph.mjs neighbors --path README.md
node scripts/source-graph.mjs mcp
```

일반 사용자는 수동 복사 대신 다음 흐름을 권장합니다.

1. VSIX를 설치합니다.
2. VS Code에서 Markdown 워크스페이스를 엽니다.
3. `MD Studio: Initialize Source Graph Workspace`를 한 번 실행해 `.mps/source-graph.sqlite`를 생성합니다.
4. `MD Studio: Install Codex Source Graph MCP`를 실행합니다.
5. `Workspace .codex/config.toml (Recommended)`를 선택합니다.
6. `MD Studio: Download Skill Folder`에서 `Bundled Codex`를 선택하고, `source-graph-search` 스킬이 없으면 `.codex/skills`로 업데이트합니다.
7. Codex를 재시작하거나 해당 trusted workspace에서 새 Codex 세션을 시작합니다.

설치 명령은 `.codex/config.toml`에 관리되는 MCP 블록을 쓰고, `.mps/source-graph.sqlite`를 생성/갱신하며, MCP 서버가 현재 워크스페이스를 바라보도록 설정합니다. `MD Studio: Check Codex Source Graph MCP Status`로 Node, 번들 MCP 스크립트, graph DB, config 등록 상태를 확인할 수 있습니다. 업데이트 확인은 Markdown 링크를 하나 추가/수정한 뒤 저장하고 `MD Studio: Open Source Graph` 또는 `MD Studio: Search Source Graph`를 실행하면 됩니다. DB timestamp와 연결 edge가 변경되어야 정상입니다. `MD Studio: Remove Codex Source Graph MCP`로 관리 블록을 제거할 수 있습니다.

`MD Studio: Copy Codex Source Graph MCP Config`는 고급 사용자나 `~/.codex/config.toml`에 직접 붙여넣고 싶은 경우를 위한 수동 설정 명령으로 남겨둡니다.

MCP 서버는 `source_graph_update`, `source_graph_search`, `source_graph_related`, `source_graph_neighbors` 도구를 제공합니다. 번들 Codex 스킬 `source-graph-search`는 관련 문서 검색, backlink 탐색, 변경 후 인덱스 갱신에 이 도구를 우선 사용하도록 안내합니다.

### Reader 내부 텍스트 검색

- 프리뷰 Webview에서 `Ctrl+F` → 우측 상단에 검색 바 등장
- 실시간 하이라이트 + `↑`/`↓` 또는 `Enter`/`Shift+Enter`로 결과 순환
- `Escape`로 닫기 및 하이라이트 제거

설정:

- `mdStudioPreview.autoOnSave` (기본값 `true`)
- `mdStudioPreview.cursorSyncOnSave` (기본값 `true`)
- `mdStudioPreview.nodePath` (기본값 `node`)
- `mdStudioPreview.cliScriptPath` (기본값 `scripts/md-to-html.mjs`)
- `mdStudioPreview.preferredViewMode` (기본값 `stack`, 값: `auto | slides | stack`)
- `mdStudioPreview.extraArgs` (기본값 `["--standalone"]`)
- `mdStudioPreview.stripEmailDisclaimer` (기본값 `false`)
- `mdStudioPreview.skillsDir` (기본값 `claude_skills/skills`)
- `mdStudioPreview.defaultSkill` (기본값 `md-presentation-composer`)
- `mdStudioFileBrowser.extraExtensions` (기본값 `[]`)

기본 `mdStudioPreview.cliScriptPath` 값을 사용할 때는 확장 내부에 번들된 CLI를 먼저 사용합니다.
워크스페이스 외부 파일도 동일하게 번들 CLI를 사용하며, `mdStudioPreview.cliScriptPath`에 절대 경로를 지정해 오버라이드할 수 있습니다.

패키징:

```bash
cd vscode-extension
npm install
npm run build
npm run package:vsix
```

설치:

```bash
code --install-extension .\markdown-pattern-studio-preview-0.1.34.vsix
```

### 커서 동기화 동작 (Ctrl+S)

기본값에서 Markdown을 저장하면 아래 순서로 동작합니다.

1. 현재 Markdown을 CLI로 다시 렌더링
2. 저장 시점의 에디터 커서 line을 기준으로 섹션(heading) 식별
3. Webview의 Outline 이동 로직을 재사용해 해당 섹션으로 이동

특징:

- 문단 단위가 아닌 섹션 단위 동기화
- Slides/Stack 모드 모두 기존 네비게이션 흐름 유지
- 같은 섹션에서 연속 저장 시 불필요한 재이동 최소화

끄고 싶을 때:

- VS Code Settings에서 `mdStudioPreview.cursorSyncOnSave`를 `false`로 변경

자세한 사용법/구조/트러블슈팅:

- [Extension Guide](vscode-extension/EXTENSION_GUIDE.md)

## HTML 변환 결과 캡처

아래 이미지는 Markdown을 HTML로 변환한 뒤(standalone) 브라우저에서 연 결과 예시입니다.

![HTML 변환 결과 화면](assets/images/result.png)

확인 포인트:

1. 우측 `Outline`에서 섹션 이동이 가능한지
2. 하단 `Prev/Next`로 페이지(슬라이드) 이동이 가능한지
3. `Stack` 버튼으로 문서형 보기 전환이 되는지

## 코드 복사 버튼 / 높이 제어

- 코드 블록은 기본적으로 `max-height: 360px` 기준으로 내부 스크롤됩니다.
- 코드 블록 속성 예시:
  - `{: maxHeight="420px" overflow="auto"}`
  - `{: height="280px"}` (숫자는 `px`로 자동 보정)
- 섹션 속성 예시:
  - `## 섹션 제목 {#section .card maxHeight="520px" overflow="auto"}`
- 앱 미리보기/저장 HTML/CLI standalone에서는 코드 헤더 `복사` 버튼을 지원합니다.

## 로컬 이미지 샘플

- 샘플 문서: `public/examples/sample.md`
- 경로 예시: `![로컬 KPI 샘플](./public/examples/assets/local-kpi-card.svg)`

## AI Skills 원본 관리

이 섹션은 저장소를 clone해서 스킬 원본을 직접 관리할 때 참고합니다. 단순히 에이전트에게 문서를 작성시키는 목적이라면 앞쪽의 `AI 에이전트로 문서 만들기` 흐름처럼 VS Code 확장에서 `MD Studio: Download Skill Folder`를 사용하는 방식을 권장합니다.

이 저장소에는 Claude / Codex / Agents용 스킬 번들이 `ai_skills/`에 포함되어 있습니다.

```
ai_skills/
├── claude/    ← 편집 원본 (여기서 수정 후 sync.sh 실행)
├── agents/    ← 자동 동기화
└── codex/     ← 자동 동기화
```

스킬 동기화:

```bash
cd ai_skills && bash sync.sh
```

### md-presentation-composer 스킬

- 스킬 정의: `ai_skills/claude/skills/md-presentation-composer/SKILL.md`
- 참조 문서: `ai_skills/claude/skills/md-presentation-composer/references/`

| 참조 문서 | 역할 |
|----------|------|
| `quick-insert-catalog.md` | 템플릿·팔레트·스니펫 카탈로그 |
| `component-selection-rules.md` | KPI 카드/표/비교/콜아웃/기술 근거 슬라이드 선택 기준 |
| `document-design-rules.md` | 표·카드·목록 선택 기준 |
| `ppt-like-markdown-rules.md` | 슬라이드형 Markdown 덱 규칙 |
| `layout-orientation-rules.md` | 화면비 판단 규칙 |
| `validation-rules.md` | 검증 및 시각적 QA 체크리스트 |
| `design-md/design-md-insights.md` | 70개 DESIGN.md 통합 인사이트 |
| `design-md/design-md-archetypes.md` | 브랜드별 디자인 archetype 선택 가이드 |
| `design-md/design-md-decision-framework.md` | 문서 목적에 따른 디자인 방향 결정 프레임워크 |
| `design-md/design-md-to-ppt-rules.md` | DESIGN.md를 PPT형 Markdown으로 번역하는 규칙 |
| `design-md/manifest.json` | 70개 브랜드 slug, 토큰, 추천 theme/intent 인덱스 |

DESIGN.md 수집/분석 재생성:

```bash
npm run design:update
```

수집 원본은 `ai_skills/claude/skills/md-presentation-composer/references/design-md/raw/`에 저장하고, `ai_skills/sync.sh`로 `agents`/`codex`에 동기화합니다.

스킬 동작 프레임워크 (Whole Document First → Audit → Map → Commit → Verify):

1. **Whole Document First** — 전체 문서를 읽고 목적, narrative spine, content families, 보존할 artifact를 먼저 정리
2. **Component System** — evidence/KPI/code/table 처리와 사용할 표현 어휘를 문서 단위로 제한
3. **Audit** — 콘텐츠 유형과 밀도 분류 (텍스트 중심 / 데이터 중심 / 비주얼 중심)
4. **Map** — 콘텐츠를 레이아웃 아키타입에 할당 (커버/스탯/타임라인/아이콘리스트 등)
5. **Commit** — 콘텐츠 작성 전 팔레트 + `intent:` 먼저 확정
6. **Verify** — 시각적 QA 체크리스트 실행 후 완료 선언

사용 예시:

```text
md-presentation-composer를 사용해서 public/examples/sample.md를 보고서 톤으로 재구성해줘.
먼저 변경 요약/자동 삽입 후보/추천 화면비만 보여주고, 승인 후 최종본을 만들어줘.
```

참고:

- `.claude/`는 로컬 에이전트 설정 폴더이므로 기본적으로 커밋 제외 대상입니다.
- 공유/배포용 스킬은 `ai_skills/claude/` 아래에서 편집하고 `sync.sh`로 배포합니다.

## 디자인 쇼케이스

신규 팔레트·템플릿·샌드위치 구조를 한 번에 확인할 수 있는 데모 문서:

```bash
npm run md2html -- public/examples/design-showcase.md --theme midnight --intent pitch --standalone
```

`design-showcase.md`는 다음을 포함합니다:

- 다크 커버 + 라이트 본문 + 다크 클로즈 (샌드위치 구조)
- `.icon-list`, `.half-bleed`, `.stats`, `.compare`, `.agenda` 슬라이드
- `theme: midnight` + `intent: pitch` 적용 예시

## 관련 파일

- 서버: `server.js`
- CLI: `scripts/md-to-html.mjs`
- 코어 엔진: `public/core/engine.js`
- 외형 옵션: `public/core/appearance.js`
- 테마/스타일: `public/document.css`
- 샘플 문서: `public/examples/sample.md`
- 디자인 쇼케이스: `public/examples/design-showcase.md`
- 샘플 자산: `public/examples/assets/local-kpi-card.svg`
- AI 스킬: `ai_skills/claude/skills/md-presentation-composer/`
- 변경 이력: [CHANGELOG.md](CHANGELOG.md)

## 변경 이력

변경 이력은 [CHANGELOG.md](CHANGELOG.md)에서 별도로 관리합니다.
