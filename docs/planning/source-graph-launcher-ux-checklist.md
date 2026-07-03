# Source Graph Launcher UX Checklist

작성일: 2026-07-02

## 목적

Source Graph launcher가 `상태 확인 -> audit 실행 -> ignore 반영 -> 재검사` 흐름을 사람과 에이전트 작업보조 관점에서 충분히 닫고 있는지 점검한다.

## 체크리스트

- 그래프 상태가 `없음 / 준비됨 / 작업 가능` 중 어디인지 문구만 읽어도 이해된다.
- 사용자가 launcher 안에서 다음 행동을 바로 고를 수 있다.
- `Run Workspace Audit`는 그래프가 아직 없어도 첫 인덱스와 진단 흐름을 시작할 수 있다.
- audit 결과가 최소한 다음 네 가지를 보여준다: Markdown 파일 수, 중복 그룹 수, 깨진 내부 링크 수, 검토할 문서 수.
- ignore 추천마다 이유, confidence, 예시 경로가 보인다.
- 추천 패턴을 `.mpsignore`에 바로 추가할 수 있다.
- 이미 추가된 패턴은 중복으로 다시 쓰지 않는다.
- 패턴 추가 후 audit 결과가 다시 갱신된다.
- `.mpsignore`를 수동 편집하고 싶은 사용자를 위한 진입점이 launcher에 남아 있다.
- 문구가 Codex/Claude 전용처럼 보이지 않고, 일반적인 wiki 작업보조 흐름으로 읽힌다.

## 검증 명령

- `npm run test:source-graph`
- `cd vscode-extension && npm run build`
- `node test/vscode-extension-cross-platform-guard.mjs`
