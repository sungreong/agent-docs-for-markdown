# Validation Rules

## 목적
- 변환 결과가 페이지 분리, 렌더, 저장 HTML에서 동일하게 보이도록 보증합니다.
- 깨진 문자/깨진 구문/빈 페이지를 사전에 제거합니다.

## 검증 순서
1. 요청 계약 검증: 사용자 요구사항, 제약, 필수 포함 항목, acceptance criteria를 명시한다.
2. 인코딩 검증(UTF-8 기준)
3. Markdown 구문 검증(heading, table, code fence, frontmatter)
4. `page-break` 정규화
5. 페이지 의미성 검증(빈 페이지 제거)
6. 저장 HTML 재검증(스크립트/네비게이션)
7. 색/폰트 대비 하네스: surface별 배경색과 heading/body/muted/link/code 색을 점검하고 대비 실패 시 수정 후 재렌더한다.
8. 실제 렌더 UX 검증: desktop/narrow 화면에서 overflow, clipping, overlap, broken image, unreadable table을 확인한다.

## 요청 계약 검증
- 최종 문서의 모든 주요 섹션은 사용자 요구, 독자 필요, 또는 근거 필요 중 하나에 연결되어야 한다.
- 사용자가 요구한 언어, 형식, 대상 독자, export target, 모바일/블로그 조건을 만족해야 한다.
- 필수 포함 항목이 빠졌으면 최종 완료로 보지 않는다.
- 불가능하거나 현재 renderer에서 깨지는 표현은 제거하거나 지원되는 class/template으로 대체한다.
- 최종 보고에는 수행한 검증과 수행하지 못한 검증을 분리해서 쓴다.

## 인코딩 규칙
- UTF-8 기준으로 읽고 쓴다.
- 문자 깨짐(`�`, 비정상 제어문자, 비정상 조합)이 감지되면 복구 후 진행한다.
- 복구가 불확실하면 원문 보존본을 기준으로 최소 수정만 수행한다.

## page-break 규칙(v2)
- 공식 토큰: `---` 다음 줄의 `{: .page-break}`
- 허용 위치: 섹션 경계, 섹션 중간, 컬럼 내부
- 섹션 중간 break: 다음 페이지에서 같은 섹션 스타일로 이어간다.
- 연속 break: 중간 빈 페이지를 만들지 않도록 정리한다.
- 문서 말미 break: 제거한다.

## 빈 페이지 판정
- 제목/문단/리스트/표/이미지/코드/콜아웃 중 아무것도 없으면 빈 페이지로 본다.
- 공백, 주석성 텍스트, break 토큰만 있는 페이지는 제거한다.

## 표/이미지/코드 밀집 페이지 규칙
- 긴 표(열 다수/행 다수)는 페이지 분리 우선.
- 표는 `table-fit` 축소 우선, 초과 시 내부 스크롤 fallback 허용.
- 이미지와 설명(caption)은 가능한 같은 페이지에 유지.
- 긴 코드 블록은 단일 페이지 강제보다 가독성 우선(필요 시 분리).

## 저장 HTML/스크립트 안정성 체크
- 슬라이드 초기화 스크립트에서 파싱 오류가 없어야 한다.
- `Invalid regular expression`/`Invalid or unexpected token`이 발생하지 않도록
  정규식 리터럴, 줄바꿈 문자열, 이스케이프 문자를 안전하게 작성한다.
- 실패 시에도 앵커 기반 이전/다음 이동(fallback)은 동작해야 한다.

## 승인형 적용 규칙
- 제안 단계에서는 원문을 수정하지 않는다.
- 아래를 포함한 제안 요약을 먼저 제시한다:
  - 적용 후보 패턴/도구 목록
  - 페이지 분리 계획
  - 화면비 추천과 근거
- 사용자 일괄 승인 후 최종 Markdown을 생성한다.

## 최종 점검 체크리스트
- Rendered/Slides/저장 HTML의 페이지 수가 일치하는가
- Prev/Next/키보드 이동이 정상 동작하는가
- Stack/Slides 전환 시 콘텐츠 누락이 없는가
- 저장 HTML을 외부로 옮겨도 fallback 이동이 가능한가
- 실제 브라우저에서 desktop 폭과 narrow/mobile 폭을 확인했는가
- 화면에서 제목/본문/표/이미지가 잘리거나 서로 겹치지 않는가
- 블로그 embed에서는 fixed viewer UI가 남아 기존 사이트 UI와 충돌하지 않는가

## Visual QA Checklist (PPTX-skill grade)

Run this checklist on every slide deck before declaring done. Assume there are problems — find them.

**Layout & Variety**
- [ ] No same template used more than 2 slides in a row
- [ ] Every slide has at least one non-text visual element (image, stat card, icon circle, or shape)
- [ ] Dark slides applied to cover and/or conclusion (sandwich structure)
- [ ] Layout varies across the deck: cover / content / stats / visual / dark close

**Typography & Hierarchy**
- [ ] Title headings are visually 2× larger than body text inside slides
- [ ] No decorative border/underline under section headings
- [ ] Body paragraphs and list items are left-aligned (never centered)
- [ ] Font pairing set via `theme:` — not left as system default when theme is specified

**Color & Contrast**
- [ ] One palette color dominates at 60–70% visual weight
- [ ] `theme:` and `intent:` are both set in frontmatter
- [ ] If `design:` is set, the slug exists in `references/design-md/manifest.json`
- [ ] The selected brand/archetype is visible through structure, density, typography, and accent role, not through color alone
- [ ] No text-on-background with insufficient contrast (especially in `.dark` slides)
- [ ] Body, list, and meaningful muted text meet WCAG AA contrast (`4.5:1` target); large headings meet at least `3:1`
- [ ] Dark/accent slides use inverse text tokens or visibly light text, not ordinary muted gray
- [ ] Accent color (`--doc-accent`) is not overused — used only for emphasis

## Color / Font Contrast Harness

Run this after drafting Markdown and before final delivery.

1. Inventory surfaces: list every page using `.dark`, `.cover .dark`, `.message .dark`, accent backgrounds, screenshots, or tinted cards.
2. Map text roles on each surface: heading, lead paragraph, body paragraph, list, muted/caption, link, inline code, table text.
3. Check contrast in the rendered artifact, not only the Markdown. Use browser screenshots, computed styles, or a visual pass at desktop and narrow widths.
4. Treat meaningful muted text as body text. If it carries content, it still needs readable contrast; do not hide important context in low-opacity gray.
5. If contrast fails, revise in this order:
   - remove `.is-muted` or convert the paragraph to normal body text
   - use `.dark` only with inverse/light text, or switch back to a light template
   - increase font weight/size only after color contrast is fixed
   - replace accent text with white/off-white on dark surfaces
   - split the slide if a dark background is making dense prose hard to scan
6. Re-render and repeat until headings, body, muted text, links, and code are legible on both desktop and narrow previews.

**Spacing & Breathing Room**
- [ ] Slide inner padding is at least `2rem` on all sides
- [ ] Content blocks have consistent vertical gap (`1.25rem`)
- [ ] No overcrowded slides — if content doesn't fit, split the page

**New Templates (if used)**
- [ ] `.dark` slides: white text readable on accent background
- [ ] `.half-bleed` slides: image fills its cell without distortion (object-fit: cover)
- [ ] `.icon-list` slides: pipe-format `icon | header | description` on every item
- [ ] `.icon-list` icon circles visible and contrast against background

**Content Quality**
- [ ] First slide communicates the core message within 3 seconds
- [ ] No placeholder text remaining in the output
- [ ] No slide is purely text — at minimum a `.stats` or `.icon-list` breaks it up
- [ ] Brand-inspired decks do not invent facts, metrics, logos, screenshots, or proprietary assets not present in the source
- [ ] No raw HTML authoring syntax remains; replace `<details>/<summary>` with `[!NOTE]`, `.message`, `.card`, table/code, or appendix pages

## DESIGN.md Library Checks

- Use `references/design-md/design-md-insights.md` before raw brand files.
- Use `references/design-md/design-md-archetypes.md` when no specific brand is requested.
- Use only one primary brand/archetype per deck unless the user explicitly asks for a comparison.
- Treat `references/design-md/raw/<slug>/DESIGN.md` as design guidance, not as permission to copy protected assets or logos.
- If a brand uses custom fonts, map them to available system fallbacks and preserve the design intent through hierarchy and spacing.

## 기본 Markdown 호환 체크 (추가)

- 체크리스트/중첩 리스트/아이템 후속 문단 렌더 확인
- raw HTML(`<div>`, `<span>`, `<br>`, `<details>`, `<summary>`)이 없는지 확인
- `_ / __ / 자동 URL / escape / hard break` 렌더 확인
- 참조형 링크/이미지(`[text][id]`, `![alt][id]`) 해석 확인
- `~~~` 코드 펜스와 ``` 코드 펜스 동등 처리 확인

## Export 안정화 규칙 (추가)

- 이미지 상대경로는 입력 MD 기준 디렉토리를 우선 사용
- standalone CLI 출력은 로컬 상대경로/절대경로/file URL 이미지를 Base64로 내장하는 것을 기본값으로 본다. 공유용 HTML에서는 `--no-embed-local-images`를 쓰지 않는다.
- 로컬 이미지 파일이 없거나 읽기 실패하면 변환은 중단하지 않고, 원본 `src` 유지 + `data-src-resolve-error="true"` + 이미지 fallback 영역 + 변환 품질 안내를 남긴다.
- 원격 이미지(`http`, `https`)와 이미 내장된 `data:` 이미지는 원본 URL을 유지한다.
- Mermaid는 렌더 시도 후 실패 시 원문 fallback 유지
- 저장 HTML에는 우측 outline + current indicator를 포함
- 코드 블록 복사 버튼은 앱/standalone에서 동작하고 no-standalone에서는 비활성(또는 미노출)이어야 함
- `height/maxHeight/overflow` 속성은 숫자 입력 시 px 보정 후 적용되어야 함
