# Agent Docs for Markdown Rename TODO

작성일: 2026-07-03
갱신일: 2026-07-04

## 완료한 범위

- [x] Marketplace 새 extension ID를 `datanewbie-labs.markdown-agent-docs`로 변경
- [x] VS Code extension package `name`을 `markdown-agent-docs`로 변경
- [x] 사용자 표시명 `displayName`을 `Agent Docs for Markdown`으로 변경
- [x] README / extension guide의 Marketplace 링크와 VSIX 설치 예시를 `markdown-agent-docs-0.1.38.vsix`로 변경
- [x] Command Palette에 보이는 주요 command title을 `Agent Docs:*`로 변경
- [x] Activity Bar title을 `Agent Docs`로 변경
- [x] file view label을 `Markdown Files`로 변경
- [x] 사용자-facing copy의 `MD Studio`, `Markdown Studio`, `Markdown Pattern Studio` 표현을 `Agent Docs` 계열로 변경
- [x] 새 Source Graph metadata 기본값을 `markdown-agent-docs.source-graph`로 변경
- [x] 브라우저 localStorage prefix를 `markdown-agent-docs:*`로 변경
- [x] command ids를 `markdownAgentDocs.*`로 변경
- [x] file browser command ids를 `markdownAgentDocsFileBrowser.*`로 변경
- [x] settings namespace를 `markdownAgentDocs.*`, `markdownAgentDocsFileBrowser.*`로 변경
- [x] VS Code view ids를 `markdownAgentDocsContainer`, `markdownAgentDocsFileBrowser`, `markdownAgentDocsSourceGraphLauncher`로 변경
- [x] webview ids/message ids를 `markdownAgentDocs*` 계열로 변경
- [x] command/settings/view 관련 guard test 기대값을 새 namespace로 변경

## 남은 호환성 후보

새 extension으로는 위 namespace가 기준이다. 기존 설치/설정과 이어붙이고 싶으면 아래 alias/migration을 별도 작업으로 넣는다.

- [ ] `mdStudioPreview.*`, `mdStudioFileBrowser.*` command alias를 임시 등록해서 기존 keybinding을 흡수
- [ ] `mdStudioPreview.*`, `mdStudioFileBrowser.*` settings 값을 발견하면 새 setting으로 fallback/migration
- [ ] workspace/global state의 기존 `mdStudio*` key 값을 발견하면 새 key로 복사
- [ ] 브라우저 localStorage migration: 기존 `markdown-pattern-studio:*` 값을 발견하면 `markdown-agent-docs:*`로 복사
- [ ] `CHANGELOG.md`에 0.1.38 리브랜딩과 ID 변경 안내 추가
- [ ] repo clone URL을 새 GitHub repo명 기준으로 문서 전체에 맞추기

## 검증 명령

```powershell
rg -n "MD Studio|Markdown Studio|Markdown Pattern Studio|markdown-pattern-studio|Agent Docs\\?" README.md README.ko.md vscode-extension/package.json vscode-extension/README.md vscode-extension/EXTENSION_GUIDE.md vscode-extension/src public scripts
cd vscode-extension
npm run build
npm run package:vsix
code --install-extension .\markdown-agent-docs-0.1.38.vsix --force
```
