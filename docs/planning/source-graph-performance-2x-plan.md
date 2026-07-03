# Source Graph Performance 2x Plan

작성일: 2026-07-02

## 목표

큰 workspace에서도 Source Graph가 체감상 멈추지 않고 열린다. 1차 목표는 현재 workspace 기준으로 다음 구간을 약 2배 빠르게 만드는 것이다.

- 그래프 열기: cached DB를 읽고 첫 화면을 그리는 시간 단축
- 검색: Enter 제출 후 결과가 그래프에 반영되는 시간 단축
- 업데이트: 전체 workspace 재인덱싱과 변경 파일 재인덱싱 단축
- 감사: `.mpsignore` 후보와 graph health 진단 단축

## 현재 측정값

현재 workspace, 2026-07-02 측정 기준이다.

| 구간 | 현재 값 | 관찰 |
| --- | ---: | --- |
| `node scripts/source-graph.mjs update --root . --json` | 6302ms | 전체 인덱싱과 SQLite 재작성 비용이 큼 |
| `node scripts/source-graph.mjs search --root . --query search --limit 80 --no-auto-update` | 1258ms | 실제 검색보다 full DB 로딩 비용이 큼 |
| `node scripts/source-graph.mjs audit --root .` | 2236ms | inventory walk와 full DB 로딩 비용이 섞임 |
| SQLite summary read | 87ms | count/meta만 읽으면 빠름 |
| webview DB read | 275ms | headings/searchIndex 제외 시 1MB payload |
| full DB read | 796ms | headings/searchIndex 포함 시 비용 급증 |
| webview JSON stringify | 11ms / 1.15MB | 현재 webview payload 자체는 감당 가능 |
| full JSON stringify | 201ms / 26.7MB | searchIndex/headings 포함 payload는 피해야 함 |
| in-memory search algorithm | 9-35ms | 검색 알고리즘 자체는 병목이 아님 |

2026-07-02 1차 개선 후 재측정:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `search --root . --query search --limit 80 --no-auto-update` | 375ms | 1258ms 대비 약 3.35배 빠름 |
| `search --root . --query search --limit 80` fresh DB | 378ms | 최근 갱신 DB freshness cache 적용 |
| `update --root . --json` | 4729ms | 6302ms 대비 약 1.33배 빠름, 추가 개선 필요 |

2026-07-02 2차 개선 후 재측정:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `update --root . --json` | 3103ms | 6302ms 대비 약 2.03배 빠름 |
| `update-file --root . --path README.md --json` | 1321ms | sql.js export 비용이 남아 1000ms 목표에는 추가 개선 필요 |
| `search --root . --query search --limit 80 --no-auto-update` | 351ms | content-addressed search blob 이후에도 fast path 유지 |
| `.mps/source-graph.sqlite` | 18.9MB | 약 33.5MB에서 감소 |

2026-07-02 3차 개선 후 재측정:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `update-file --root . --path README.md --json` | 524ms | 1321ms 대비 약 2.52배 빠름, 1000ms 목표 달성 |
| `update-file --root . --path README.md --json --profile` 내부 | read-db 187ms, build 71ms, write 169ms | incremental reader와 changed-row search patch 적용 |
| `update --root . --json` | 3225ms | 2배 개선권 유지, 3000ms 안정 달성은 추가 작업 필요 |
| `search --root . --query search --limit 80 --no-auto-update` | 431ms | 500ms 이하 유지 |

2026-07-02 4차 개선 후 재측정:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `audit --root .` | 694ms | 1857ms 대비 약 2.67배 빠름, 1000ms 목표 달성 |
| `audit --root . --profile` 내부 | load-db 166-204ms, audit 400-600ms 범위 | audit 전용 lightweight DB reader와 5분 freshness cache 적용 |
| `update-file --root . --path README.md --json` | 481ms | incremental reader 최적화 후 500ms 안팎 |
| `search --root . --query search --limit 80 --no-auto-update` | 376ms | 500ms 이하 유지 |

2026-07-02 5차 개선 후 재측정:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `update --root . --json` | 1971ms | 6302ms 대비 약 3.20배 빠름, 3000ms 목표 달성 |
| `update --root . --json --profile` 내부 | collect 731-915ms, build 462ms, write 909-1191ms | duplicate source parse/cache 적용으로 build 대폭 감소 |
| `search --root . --query search --limit 80 --no-auto-update` | 419ms | 500ms 이하 유지 |
| `update-file --root . --path README.md --json` | 524ms | 1000ms 이하 유지 |
| `audit --root .` | 880ms | 1000ms 이하 유지 |

2026-07-02 6차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| webview graph index | `nodeById`, `docById`, `connectedNodeIds`, `groupNodeIds`, `groupEntries` 캐시 추가 | 노드 클릭, detail paint, group filter에서 반복 full-array find/set rebuild 제거 |
| webview node budget | 0-1000 docs 160, 1000-5000 docs 120, 5000+ docs 80 | 큰 workspace에서 첫 렌더와 검색 결과 그래프의 O(n^2) layout 비용 감소 |
| automatic settle budget | 1000+ docs 28 iteration, 5000+ docs 20 iteration | 검색/레이어/그룹 전환 후 자동 refine 비용 감소. 사용자가 누르는 Settle은 품질 우선으로 유지 |
| layout repulsion | 100개 초과 visible node에서 원거리 pair repulsion cutoff 적용 | 큰 visible graph에서 tick당 pair 계산의 불필요한 먼 거리 연산 감소 |
| guard/build | `source-graph-view-guard`, extension build 통과 | webview slim payload, cached map/index, dynamic budget 회귀 방지 |
| CLI sequential check | update 2133ms, search 417ms, update-file 634ms, audit 1022ms | 병렬 측정은 디스크 경합으로 왜곡되어 제외. audit profile은 load-db 151ms, audit 567ms |

2026-07-02 7차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| webview paint loop | `paint(options)`로 graph repaint와 details repaint 분리 | drag, wheel, pulse, settle 중 오른쪽 details HTML 재생성 반복 제거 |
| settle frame | 중간 frame은 `paint({ details: false })`, 마지막 frame만 details 갱신 | layout refinement 중 DOM 작업량 감소 |
| interaction metrics | `rebuildGraphState`, `paint:graph`, `paint:with-details`, `paintDetails`가 8ms 이상이면 console debug 출력 | 다음 병목을 webview console에서 숫자로 확인 가능 |
| CLI sequential check | update 2135ms, search 428ms, update-file 535ms, audit 793ms | 기존 2배 목표 유지. audit은 1000ms 아래로 복귀 |

2026-07-02 8차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| webview DB read + slim stringify | 203ms, 1.15MB payload | cached DB 첫 화면 500ms usable 기준 충족 |
| extension DB cache | SQLite file `mtimeMs + size` 기준 `readDb` 메모리 캐시 추가 | 같은 DB를 다시 여는 경우 SQLite read/row materialize 생략 |
| SQLite module import | `readDb`와 `searchDb`가 하나의 dynamic import promise 공유 | 반복 open/search의 모듈 import 고정 비용 제거 |
| direct SQLite search API | cold 143ms, warm 61ms, 80 results | webview Enter 검색 후 highlight 300ms 기준 충족 근거 |
| CLI sequential check | update 2055ms, search 356ms, update-file 427ms, audit 689ms | 모든 핵심 경로가 2배 목표와 개별 완료 기준 유지 |

2026-07-02 9차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| document source hash | `documents.source_hash` 저장 및 기존 DB `ensureColumn` migration 추가 | mtime만 흔들린 파일을 내용 변경으로 오판하지 않도록 기반 마련 |
| stale check | mtime/size 후보 중 `sourceHash`가 같은 파일은 `changedPaths`에서 제외 | 같은 내용 재저장, formatter no-op, timestamp drift 때 `update-file`/full rewrite 회피 |
| guard | `source-graph-guard`가 sourceHash 저장과 mtime-only skip을 검증 | hash 기반 no-op 변경 감지 회귀 방지 |
| CLI sequential check | update 2304ms, search 414ms, update-file 513ms, audit 797ms | source_hash 추가 후에도 기존 2배 목표와 개별 기준 유지 |

2026-07-02 10차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| `audit --summary-only --no-auto-update --profile` | 85ms | SQLite aggregate count만 읽고 inventory walk/full audit payload 생략 |
| summary aggregate | indexed documents, headings, links, unresolved internal links, orphan documents, graph nodes/edges | 대시보드/자동화가 count만 필요할 때 full audit 대신 사용 가능 |
| guard | `source-graph-audit-guard`가 full audit count와 summary-only aggregate 일치 검증 | summary-only fast path 회귀 방지 |

2026-07-02 11차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| directory walk | `collectMarkdownFiles` directory traversal에 concurrency limit 적용 | audit inventory walk와 update collect 시간 단축 |
| `audit --root . --profile` | load-db 189ms, audit 219ms | full audit 내부 작업이 400ms대까지 감소 |
| `update --root . --json --profile` | collect 458ms, build 584ms, write 1084ms | directory walk 병렬화 후 collect 병목 감소 |
| CLI sequential check | update 1719ms, search 381ms, update-file 435ms, audit 540ms, audit-summary 368ms | 전체 핵심 경로가 안정적으로 2배 목표 이상 유지 |

2026-07-02 12차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| Audit Manager payload | full audit object 대신 `toAuditManagerViewModel` 결과만 webview에 주입 | review table, pagination, weak spot 카드에 필요한 행만 전달해 open 시 JSON payload와 client-side traversal 감소 |
| Audit Manager client render | `auditView.recommendations`, `auditView.reviewRows`, `auditView.weakSpots` 사용 | webview JS가 full `ignore`/`graph` 구조를 다시 순회하지 않음 |
| CLI sequential check | update 1584ms, search 419ms, update-file 454ms, audit 485ms, audit-summary 302ms | Audit Manager payload 축소 후에도 전체 핵심 경로가 2배 목표 이상 유지 |

2026-07-02 13차 개선 후 확인:

| 구간 | 개선 후 | 변화 |
| --- | ---: | --- |
| audit inventory cache | `.mps/source-graph-audit-cache.json` 추가 | inventory path/mtime/size/ignored와 `.mpsignore` pattern signature가 같으면 duplicate copy group과 ignore review 계산 결과 재사용 |
| repeated audit | cold 532ms, warm cache 466ms | 반복 Audit Manager open에서 후보 계산과 행 생성 비용 감소. `.mpsignore` 변경 시 자동 무효화 |
| guard | `source-graph-audit-guard`가 cache 생성, cache hit, `.mpsignore` 변경 invalidation 검증 | audit cache 회귀 방지 |
| CLI sequential check | update 1829ms, search 378ms, update-file 445ms, audit 524ms, audit-summary 373ms | 모든 핵심 경로가 최초 기준 대비 2배 이상 개선 상태 유지 |

현재 DB 요약:

- documents: 1071
- headings: 29281
- links: 221
- graph nodes: 1116
- graph edges: 221
- SQLite file: 약 33MB
- JSON legacy file: 약 18MB

payload 크기:

- documents: 0.67MB
- headings: 8.49MB
- links: 0.09MB
- citations: 0.03MB
- searchIndex: 17.0MB
- graph: 0.39MB

## 핵심 진단

1. 검색이 느린 이유는 검색 계산이 아니라 DB 로딩이다.
   `searchSourceGraph` 자체는 10-35ms 수준이다. CLI 검색이 1초 이상 걸리는 것은 `loadOrUpdateGraph`가 full DB를 읽고, headings/searchIndex까지 메모리로 복원하기 때문이다.

2. webview에 full searchIndex를 넣으면 안 된다.
   `searchIndex`만 17MB라서 webview payload에 포함하면 열기, 직렬화, 메모리 사용량이 모두 악화된다.

3. extension 검색은 전용 SQLite query API가 필요하다.
   `readDb`는 현재 webview용 슬림 DB를 읽는다. body 검색 품질과 속도를 둘 다 잡으려면 `searchIndex`를 통째로 로드하지 말고 SQLite에서 `documents + search_index`만 필요한 만큼 조회해야 한다.

4. 그래프 렌더링은 최대 160개 노드로 제한되어 있지만, 계산은 여전히 전체 배열을 자주 순회한다.
   `currentEdges`, `graphDegree`, `groupVisibleNodes`, `expandWithNeighbors`, `paintDetails`가 반복적으로 전체 nodes/links/edges를 순회한다. 1,000개 규모에서는 버티지만 5,000-20,000개 workspace에서는 체감 지연이 커진다.

5. layout tick은 O(n^2) repulsion이다.
   현재 visible node가 160개로 제한되어 있어 최악은 제한되어 있지만, settle마다 160개 기준 pair 계산이 반복된다. 노드 수를 120개로 낮추거나 Barnes-Hut/grid approximation으로 바꾸면 즉시 체감이 좋아진다.

6. 전체 update는 항상 새 SQLite를 통째로 쓴다.
   `writeSourceGraphSqlite`는 새 DB를 만들고 전체 row를 insert/export/write한다. 소규모 변경도 `updateSourceGraphDocuments` 후 전체 DB를 다시 쓴다.

## 방법론 비교

| 방법 | 기대 효과 | 난이도 | 리스크 | 우선순위 |
| --- | --- | --- | --- | --- |
| SQLite 전용 검색 API | 검색 2-4배, body 검색 품질 회복 | 중 | SQL escaping/랭킹 일치 | P0 |
| summary/read 분리 | open 상태 확인 3배 이상 | 낮음 | 낮음 | P0 |
| webview payload 유지 + lazy detail query | open graph 안정화 | 중 | webview message 경로 추가 | P0 |
| adjacency/degree index precompute | graph interaction 2배 가능 | 낮음 | 낮음 | P1 |
| paintDetails link index | 노드 클릭 지연 감소 | 낮음 | 낮음 | P1 |
| layout node budget 동적화 | 첫 렌더 빠름 | 낮음 | 큰 그래프에서 덜 풍부해 보일 수 있음 | P1 |
| worker/offscreen layout | UI freeze 감소 | 높음 | VS Code webview CSP/번들 복잡도 | P2 |
| incremental SQLite row update | update-file 대폭 개선 | 높음 | schema/write consistency | P2 |
| FTS5 도입 | 검색 정확도/속도 개선 | 중-높음 | sql.js FTS 지원 확인 필요 | P2 |
| file walk 병렬화 제한 | update 1.3-2배 가능 | 중 | Windows I/O 폭주 조절 필요 | P2 |

## 개선 체크리스트

### P0: 검색과 열기 체감 속도

- [x] `public/core/source-graph-sqlite.js`에 `searchSourceGraphSqlite(dbPath, query, mode, limit)` 추가
- [x] SQL에서 `documents`와 `search_index`를 join하고, title/path/text 점수를 계산해 limit만 반환
- [x] extension의 `respondToSourceGraphSearch`와 launcher 검색이 full DB를 읽지 않고 전용 SQLite search API를 호출하도록 변경
- [x] CLI `search`도 기본 경로에서는 full DB 대신 SQLite search API를 사용하도록 변경
- [x] `--include-headings`, `--include-links` 같은 rich 옵션이 있을 때만 full DB enrichment를 수행
- [x] body search 결과가 실제 본문 검색인지 guard test 추가
- [x] 검색 benchmark 추가: 현재 workspace 기준 `search --no-auto-update` 1258ms -> 500ms 이하 목표
- [x] 최근 갱신 DB는 stat walk 없이 검색하도록 30초 freshness cache 추가

### P1: webview 그래프 계산 최적화

- [x] webview 초기화 시 `linksBySource`, `linksByTarget`, `edgesByNode`, `degreeByNode`를 한 번만 만든다
- [x] webview 초기화 시 `nodeById`, `docById`, `groupNodeIds`를 한 번만 만든다
- [x] `graphDegree(id)`가 매번 전체 edge를 reduce하지 않고 `degreeByNode.get(id)`를 사용한다
- [x] `paintDetails`의 outbound/inbound 계산을 전체 `db.tables.links.filter` 대신 index lookup으로 교체한다
- [x] `highlightNeighborhood`가 전체 edge 순회 대신 `edgesByNode`를 사용한다
- [x] `expandWithNeighbors`가 전체 edge 순회 대신 `edgesByNode`를 사용한다
- [x] `groupVisibleNodes`가 매 호출마다 전체 nodes를 다시 group하지 않도록 group index를 캐시한다
- [x] `defaultFilteredNodes` 정렬 전에 후보군을 먼저 줄여 O(n log n) 정렬 비용을 낮춘다
- [x] graph interaction benchmark를 추가한다: `rebuildGraphState`, `paint`, `paintDetails` duration을 webview console metric으로 출력

### P1: 첫 렌더와 layout 최적화

- [x] 첫 렌더 node budget을 workspace 크기에 따라 조정한다: 0-1000 docs는 160, 1000-5000 docs는 120, 5000+ docs는 80
- [x] 검색 결과 그래프는 direct match + 1-hop neighbor를 최대 120개까지만 보여주고, 나머지는 detail list에서 paging한다
- [x] `settleLayout(36)`을 큰 workspace에서 `settleLayout(20)`으로 줄이고, 사용자가 `Settle`을 누를 때만 추가 refinement를 수행한다
- [x] repulsion pair 계산에 grid bucket 또는 distance cutoff를 적용한다
- [x] `paint()`에서 매번 `graph.innerHTML` 전체 교체 대신 최소한 details repaint와 graph repaint를 분리한다

### P2: 인덱싱/update 최적화

- [x] `collectMarkdownFiles`의 Markdown source `readFile`을 concurrency limit 기반으로 병렬화한다
- [x] `collectMarkdownFiles`의 directory walk를 concurrency limit 기반으로 병렬화한다
- [x] update 시 stat만 먼저 수집하고, 변경 파일만 source를 읽는다
- [x] `updateGraphFiles`가 전체 SQLite row rebuild를 피하도록 row-level replace writer를 추가한다
- [x] `updateGraphFiles`가 headings/search text를 읽지 않는 lightweight incremental DB reader를 사용한다
- [x] schema에 `documents.content_hash` 또는 `source_hash`를 추가해 mtime 흔들림에 더 안정적으로 대응한다
- [x] `search_index.text`를 content-addressed `search_blobs`로 분리해 중복 본문 저장을 줄인다
- [x] duplicate source parse/cache를 적용해 같은 본문 복사본의 heading/search/snippet/wordCount 재계산을 줄인다
- [x] update benchmark 추가: 현재 workspace 기준 6302ms -> 약 3103ms
- [x] update-file 1000ms 목표 달성: 1321ms -> 524ms
- [x] full update 3000ms 이하 달성: 6302ms -> 1971ms

### P2: audit 최적화

- [x] audit에서 full DB 대신 documents/links 중심 lightweight SQLite reader를 사용한다
- [x] audit 반복 실행 시 최근 갱신 DB는 stat walk 없이 5분 freshness cache를 사용한다
- [x] audit에서 summary count만 필요한 경우 SQLite aggregate query 사용
- [x] duplicate copy group과 ignore review inventory를 캐시해 `.mpsignore` 변경이 없으면 재사용
- [x] audit manager open 시 full audit object를 보내지 않고 page-render용 slim view model만 전달한다
- [x] audit benchmark 추가: 현재 workspace 기준 1857ms -> 694ms

## 권장 구현 순서

1. SQLite 전용 검색 API를 먼저 만든다.
   가장 체감이 크고, 현재 구조의 correctness 문제도 같이 해결한다. searchIndex를 webview에 싣지 않으면서 body 검색을 살릴 수 있다.

2. webview 내부 index map을 만든다.
   코드 변경은 작지만 반복 순회를 크게 줄인다. 클릭, 검색 결과 반영, 그룹 필터가 모두 빨라진다.

3. 첫 렌더 node budget과 settle budget을 동적으로 낮춘다.
   큰 workspace에서 "일단 보인다"를 우선한다. 전체성을 잃지 않도록 detail list와 search results로 보완한다.

4. update/audit는 그 다음 단계에서 손댄다.
   전체 update는 6초대로 느리지만 사용 빈도는 open/search보다 낮다. 다만 큰 workspace에서는 반드시 row-level update로 가야 한다.

## 완료 기준

- [x] 현재 workspace에서 `search --no-auto-update`가 500ms 이하
- [x] graph open 시 cached DB 첫 화면이 500ms 내 usable: webview DB read + slim stringify 203ms
- [x] webview search Enter 후 highlight 반영이 300ms 내 체감: direct SQLite search cold 143ms, warm 61ms
- [x] update가 약 2배 빨라짐: 6302ms -> 3103ms
- [x] 변경 파일 update 1000ms 이하 달성: 524ms
- [x] full update 3000ms 이하 달성: 1971ms
- [x] audit가 1000ms 내 결과를 반환: 694ms
- [x] guard test가 body search, file search, no full searchIndex webview payload를 확인
- [x] extension `readDb`가 unchanged SQLite DB를 mtime/size 기준으로 재사용하고, search/read가 SQLite dynamic import promise를 공유한다

## 다음 구현 후보

가장 먼저 구현할 단위는 `SQLite search fast path`다.

예상 변경 파일:

- `public/core/source-graph-sqlite.js`
- `scripts/source-graph.mjs`
- `vscode-extension/src/commands/sourceGraph.ts`
- `test/source-graph-guard.mjs`
- `test/source-graph-view-guard.mjs`

이 작업만으로 검색 체감은 2배 이상 빨라질 가능성이 높다. 현재 검색의 실제 match 계산은 빠르고, 느린 부분은 full DB read와 process startup/load path이기 때문이다.
