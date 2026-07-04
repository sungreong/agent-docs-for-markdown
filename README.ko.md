# Agent Docs for Markdown

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Agent%20Docs%20for%20Markdown-0078d4?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-agent-docs)

로컬 Markdown 폴더를 AI 에이전트가 읽기 좋은 문서 그래프로 바꿉니다.

Agent Docs for Markdown은 Markdown으로 지식베이스, 리서치 노트, 위키, 보고서를 관리하는 사람을 위한 VS Code 확장입니다. 로컬 문서를 Source Graph로 인덱싱하고, 정리해야 할 노이즈를 찾고, 에이전트용 스킬을 설치하고, 마지막에는 HTML로 내보냅니다.

English guide: [README.md](README.md)  
VS Code Marketplace용 문서: [vscode-extension/README.md](vscode-extension/README.md)

현재 저장소 확장 버전: `0.1.55`

## 한 문장으로

Markdown 파일은 그대로 두고, AI가 쓸 수 있는 “로컬 LLM wiki 지도”를 VS Code 안에 만듭니다.

## 왜 필요한가

AI 에이전트에게 “이 문서 좀 업데이트해줘”라고 하면 보통 문제가 생깁니다.

- 어떤 문서가 기준 문서인지 모릅니다.
- 비슷한 문서가 여러 개 있으면 중복 업데이트를 합니다.
- `.codex`, `.agents`, `.claude`, 빌드 산출물 같은 노이즈를 같이 읽습니다.
- 링크, backlink, 깨진 링크, URL 근거를 놓칩니다.
- 한 문서를 바꿀 때 같이 봐야 할 문서를 모릅니다.

Agent Docs for Markdown은 이 문제를 Source Graph와 내장 스킬로 해결합니다.

## 화면으로 보기

### Source Graph Focus / Hop

![Source Graph multi-hop focus view](assets/images/source-graph-multi-hop.png)

노드를 선택하고 `Focus`를 누르면 선택 노드 주변만 남깁니다. 다른 노드를 선택한 뒤 `Hop +`를 누르면 기존 구조는 유지한 채 그 선택 노드에서만 새 가지를 확장합니다.

### Workspace Cleanup Audit

![Workspace Cleanup Audit](assets/images/md-cleanup.png)

에이전트에게 작업을 맡기기 전에 `.mps/.mpsignore` 후보, 깨진 링크, 고립 문서, 중복 skill copy를 검토합니다. 명확한 후보는 `Select Page` 또는 `Select All`로 한 번에 적용할 수 있습니다.

### VS Code 확장 워크플로

![Agent Docs for Markdown VS Code workflow](assets/images/vscode-extension-0.1.34-updates.png)

파일 탐색, 미리보기, Source Graph, Cleanup Audit, 스킬 설치를 VS Code 안에서 처리합니다.

### GitHub 전용 로컬 웹 에디터

![Agent Docs for Markdown local web editor](assets/images/web.png)

저장소를 clone하면 별도 로컬 웹 에디터와 CLI도 사용할 수 있습니다. 단, VS Code Marketplace 확장에는 웹 에디터 서버가 포함되지 않습니다.

## 설치

VS Code Marketplace:

[Agent Docs for Markdown](https://marketplace.visualstudio.com/items?itemName=datanewbie-labs.markdown-agent-docs)

VS Code Quick Open:

```text
ext install datanewbie-labs.markdown-agent-docs
```

처음 사용할 때 추천 흐름:

1. VS Code에서 Markdown 워크스페이스를 엽니다.
2. Activity Bar에서 Agent Docs를 엽니다.
3. `Open Graph` 또는 `Agent Docs: Open Source Graph`를 실행합니다.
4. `Run Workspace Audit`로 정리 후보를 확인합니다.
5. `Agent Docs: Install or Export Skills`를 실행합니다.
6. 아래 예시처럼 에이전트에게 `markdown-manager` 사용을 요청합니다.

## 내장 스킬은 어떻게 쓰나

Command Palette에서 실행:

```text
Agent Docs: Install or Export Skills
```

추천 선택:

```text
Install recommended Markdown Manager skill
```

그 다음 사용할 에이전트 폴더를 선택합니다. `.claude/skills`, `.agents/skills`, `.codex/skills`, `.gemini/skills`, `.cursor/skills` 같은 대상 폴더가 없으면 자동 생성됩니다.

기본 설치는 `markdown-manager` 하나만 설치합니다. 사용자는 slash command 목록에서 여러 개를 고를 필요 없이 `/markdown-manager`로 시작하고, 그 안에서 검색, 그래프 진단, 링크 수리, 업데이트 계획, 보고서 작성 같은 내부 workflow를 자동으로 고르게 됩니다.

세부 스킬을 직접 설치하고 싶을 때만 `Advanced: choose source and target`를 사용하면 됩니다.

### 에이전트 채팅에서는 이렇게 사용합니다

설치가 끝나면 AI 에이전트 채팅에서 `markdown-manager`를 첫 지시로 넣으면 됩니다. slash command를 지원하는 곳에서는 `/markdown-manager`를 입력하고, 일반 채팅에서는 `markdown-manager를 사용해줘` 또는 `Use markdown-manager`라고 쓰면 됩니다.

사용자가 하위 스킬을 직접 고를 필요는 없습니다. 평소처럼 문서 작업을 설명하면 `markdown-manager`가 검색, 그래프 진단, ignore 추천, 읽기 묶음 구성, 업데이트 계획, canonical 판단, 링크 수리, 보고서/발표 구성, export 점검, 환경 진단 중 무엇이 필요한지 내부에서 고릅니다.

바로 쓸 수 있는 시작 문장:

```text
/markdown-manager 이 문서와 연결된 관련 문서까지 찾아서 업데이트 범위를 알려줘.
```

```text
markdown-manager를 사용해줘.

이 Markdown 워크스페이스를 AI에게 맡기기 전에 깨진 링크, 고립 문서, 중복 생성물, .mpsignore 후보를 먼저 찾아줘.
```

```text
/markdown-manager 이 주제에 대해 글을 쓰기 전에 에이전트가 먼저 읽어야 할 최소 문서 묶음을 만들어줘.
```

```text
markdown-manager를 사용해서 @brief.md를 Agent Docs 보고서로 재구성해줘. 근거는 유지하고 구조를 개선한 뒤 export 점검 목록까지 넣어줘.
```

### 가장 먼저 쓸 스킬

| 스킬 | 이런 상황에서 사용 | 에이전트에게 이렇게 물어보기 |
| --- | --- | --- |
| `markdown-manager` | Markdown 검색, 그래프 정리, 링크 점검, 업데이트 계획, 보고서/덱 작성, export 점검을 한 입구에서 처리하고 싶을 때 | `markdown-manager를 사용해서 이 요청을 이해하고 알맞은 Agent Docs workflow를 골라줘. wiki/concepts/agentic-ai.md를 수정하려는데 관련 문서와 깨진 링크를 놓치고 싶지 않아.` |

### `markdown-manager`가 내부에서 고르는 workflow

| 내부 workflow | 이런 상황에서 사용 | 에이전트에게 이렇게 물어보기 |
| --- | --- | --- |
| `markdown-workspace-search` | Markdown 안의 근거를 찾아 답해야 할 때 | `markdown-workspace-search를 사용해서 이 워크스페이스에서 NVIDIA agent evaluation 관련 내용을 찾아줘. 경로, heading, backlink, 관련 문서를 같이 보여줘.` |
| `markdown-graph-triage` | 문서 묶음 전체 상태를 점검할 때 | `markdown-graph-triage를 사용해서 이 Markdown 워크스페이스를 진단해줘. 진입 문서, 고립 문서, 노이즈 폴더, 중복 skill copy, 약한 그래프 구조를 찾아줘.` |
| `markdown-ignore-advisor` | `.mpsignore`에 넣을 폴더를 판단할 때 | `markdown-ignore-advisor를 사용해서 Source Graph에서 제외해야 할 폴더와 파일 패턴을 추천해줘. 왜 제외해야 하는지도 설명해줘.` |
| `markdown-context-packager` | 글을 쓰기 전에 읽어야 할 문서 묶음을 만들 때 | `markdown-context-packager를 사용해서 "agent runtime reliability" 주제로 작업하기 전에 읽어야 할 문서, heading, backlink, URL 근거를 패키징해줘.` |
| `markdown-update-planner` | 한 문서를 바꾸기 전에 영향 범위를 보고 싶을 때 | `markdown-update-planner를 사용해서 wiki/concepts/agentic-ai.md를 수정하기 전에 같이 확인해야 할 링크 문서와 관련 문서를 계획해줘.` |
| `markdown-canonicalizer` | 비슷한 문서가 여러 개라 기준 문서를 정해야 할 때 | `markdown-canonicalizer를 사용해서 "MCP tooling" 관련 Markdown 중 canonical 문서를 골라줘. 병합, 보관, 유지 분리 후보도 알려줘.` |
| `markdown-link-repair` | 깨진 링크, 오래된 URL, 약한 backlink를 고칠 때 | `markdown-link-repair를 사용해서 깨진 내부 링크와 오래된 URL 참조를 찾아줘. Source Graph 품질에 큰 영향이 있는 순서로 우선순위를 정해줘.` |
| `md-presentation-composer` | Markdown을 보고서, 제안서, 튜토리얼, 발표형 문서로 바꿀 때 | `md-presentation-composer를 사용해서 이 리서치 노트를 8페이지 임원 보고서 형태로 재구성해줘. 근거는 유지하고 구조와 시각적 흐름을 개선해줘.` |
| `md-to-deck-designer` | Markdown을 슬라이드/PPTX 준비 구조로 바꿀 때 | `md-to-deck-designer를 사용해서 이 Markdown을 슬라이드 덱으로 바꿔줘. 각 페이지 의도를 보존하고 먼저 디자인 시스템을 제안해줘.` |
| `document-production-advisor` | HTML/blog/DOCX handoff 품질을 점검할 때 | `document-production-advisor를 사용해서 이 Markdown이 standalone HTML, blog embed HTML, DOCX handoff에서 깨지지 않을지 점검해줘.` |
| `install-diagnostics` | 로컬 도구나 환경 문제가 있을 때 | `install-diagnostics를 사용해서 Agent Docs workflow에 필요한 Node, npm, CLI, PATH 설정이 준비됐는지 확인해줘.` |

### 바로 쓸 수 있는 프롬프트 예시

문서 검색:

```text
markdown-manager를 사용해줘.

질문: 이 워크스페이스에서 "agent evaluation"을 어떻게 설명하고 있어?
반드시 포함:
- 관련 파일 경로
- heading 근거
- backlink / outbound link
- 다음에 읽을 문서
- 답변에 사용한 근거 요약
```

문서 수정 전 계획:

```text
markdown-manager를 사용해줘.

목표: wiki/concepts/agentic-ai.md를 업데이트하고 싶어.
먼저 수정하지 말고 아래만 알려줘:
- 먼저 읽어야 할 문서 묶음
- 왜 그 문서가 필요한지
- 같이 업데이트할 가능성이 있는 문서
- 링크나 용어 충돌 위험
- 추천 작업 순서
```

워크스페이스 정리:

```text
markdown-manager를 사용해줘.

이 Markdown 워크스페이스를 AI에게 맡기기 전에 정리하고 싶어.
Source Graph audit 결과를 기준으로:
- 노이즈 폴더
- 중복 skill copy
- 고립 문서
- 깨진 링크
- .mps/.mpsignore 후보
를 우선순위로 정리해줘.
```

보고서 작성:

```text
markdown-manager를 사용해줘.

@brief.md를 Agent Docs for Markdown 보고서로 재구성해줘.
대상: 기술 리더
톤: 간결하고 근거 중심
출력: Markdown만
조건:
- frontmatter에 title, theme, intent, appearance 포함
- 긴 문단은 표, 리스트, feature-grid 중 하나로 정리
- 마지막에 HTML export 점검 체크리스트 포함
```

## Source Graph 사용법

Source Graph는 워크스페이스마다 로컬 DB를 만듭니다.

```text
.mps/source-graph.sqlite
```

주요 버튼:

- `URLs`: 외부 URL 참조 노드를 표시합니다.
- `Images`: 이미지/자산 참조 노드를 표시합니다.
- `Broken`: 깨진 Markdown 링크를 표시합니다.
- `Groups`: 폴더별 그룹 영역을 표시합니다.
- `Focus`: 선택한 노드와 직접 연결된 주변 노드만 보여줍니다.
- `Hop +`: 현재 선택한 노드에서만 새 이웃을 추가합니다. 기존 focus 구조는 유지됩니다.
- `All`: 전체 그래프로 돌아갑니다.
- `Layout`: 현재 상태에 맞게 레이아웃을 다시 잡습니다.

권장 사용 순서:

1. `Open Graph`로 현재 문서 관계를 봅니다.
2. 큰 그래프에서는 검색 또는 `Focus`로 시작합니다.
3. 관심 노드를 선택하고 `Hop +`로 필요한 가지만 확장합니다.
4. `Run Workspace Audit`로 정리 후보를 확인합니다.
5. `.mps/.mpsignore`를 정리한 뒤 에이전트에게 작업을 맡깁니다.

## HTML Export

VS Code에서 실행:

```text
Agent Docs: Export Styled HTML
```

| Target | 용도 |
| --- | --- |
| Complete HTML File | 로컬에서 열거나 공유할 완성 HTML |
| Blog Paste HTML | Tistory, WordPress, Velog 등에 붙여넣을 scoped HTML |
| Content Fragment | 외부 시스템의 자체 shell에 넣을 본문 조각 |

CLI에서도 같은 렌더러를 사용할 수 있습니다.

```bash
npm run md2html -- test/notes.md --out test/notes.html --standalone
npm run md2html -- test/notes.md --out test/notes.blog.html --export-target blog-embed
```

## GitHub 전용 로컬 웹 에디터

VS Code 확장과 별개입니다. 저장소를 clone해서 브라우저 에디터, 템플릿, CLI, 렌더러 개발을 사용할 때만 필요합니다.

```bash
git clone https://github.com/sungreong/agent-docs-for-markdown.git
cd agent-docs-for-markdown
npm install
npm start
```

브라우저:

```text
http://localhost:3188
```

## 개발

```bash
npm install
npm run test:source-graph

cd vscode-extension
npm install
npm run build
npm run package:vsix
```

## 관련 문서

- 영어 README: [README.md](README.md)
- VS Code 확장 README: [vscode-extension/README.md](vscode-extension/README.md)
- 확장 상세 가이드: [vscode-extension/EXTENSION_GUIDE.md](vscode-extension/EXTENSION_GUIDE.md)
- 변경 이력: [CHANGELOG.md](CHANGELOG.md)
- Source Graph CLI: [scripts/source-graph.mjs](scripts/source-graph.mjs)
- HTML 렌더 CLI: [scripts/md-to-html.mjs](scripts/md-to-html.mjs)
