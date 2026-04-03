/**
 * SNIPPETS — 빠른 삽입 블록 정의
 *
 * app.js와 template-builder.html 양쪽에서 import해서 사용합니다.
 * 새 블록을 추가할 때는 이 파일만 수정하면 됩니다.
 */
export const SNIPPETS = [
  {
    name: 'h2',
    label: 'H2 섹션',
    category: 'basic',
    description: '일반 섹션을 추가합니다.',
    text: '\n## 새 섹션\n\n내용을 입력하세요.\n',
  },
  {
    name: 'cover',
    label: 'Cover',
    category: 'layout',
    description: '커버 섹션 속성 예시를 삽입합니다.',
    text: '\n# 문서 제목 {#cover .cover eyebrow="Monthly Report"}\n\n첫 문단을 작성하세요.\n',
  },
  {
    name: 'two-column',
    label: '2단 섹션',
    category: 'layout',
    description: '부모 섹션의 하위 섹션 2개를 좌우 컬럼으로 배치합니다.',
    text: '\n## 핵심 요약 {#summary .two-column}\n\n### 왼쪽 섹션\n\n\n### 오른쪽 섹션\n\n',
    layoutCols: ['왼쪽 섹션', '오른쪽 섹션']
  },
  {
    name: 'stats',
    label: 'Stats',
    category: 'content',
    description: '리스트를 KPI 카드로 렌더합니다.',
    text: '\n### 핵심 KPI {#kpi .stats}\n- 전환율 | 4.1% | +0.8%p\n- 매출 | 1.24억 | +18%\n- 활성 사용자 | 1,480 | +23%\n',
  },
  {
    name: 'callout',
    label: 'Callout',
    category: 'content',
    description: '옵시디안 스타일 callout 입니다.',
    text: '\n> [!INFO] 메모\n> 강조하고 싶은 내용을 적으세요.\n',
  },
  {
    name: 'table',
    label: '표 + 속성',
    category: 'content',
    description: '표와 아래 속성 줄을 같이 삽입합니다.',
    text: '\n| 항목 | 목표 | 실적 |\n| --- | ---: | ---: |\n| 매출 | 100 | 124 |\n| 전환율 | 3.2 | 4.1 |\n{: .zebra .bordered .compact caption="월별 성과 비교" emphasis="last-col"}\n',
  },
  {
    name: 'image',
    label: '이미지 + 속성',
    category: 'content',
    description: '이미지와 속성 줄을 삽입합니다.',
    text: '\n![차트 설명](https://dummyimage.com/1200x520/e5eefc/1f3b7a.png&text=KPI+Chart)\n{: width="88%" align="center" caption="이미지 캡션"}\n',
  },
  {
    name: 'code',
    label: '코드 블록',
    category: 'content',
    description: '코드 블록과 title 속성 예시를 삽입합니다.',
    text: '\n```js title="preview-pipeline.js"\nfunction renderPreview(markdown) {\n  return markdown;\n}\n```\n',
  },
  {
    name: 'title-slide',
    label: 'Title Slide',
    category: 'slide',
    description: '표지/타이틀 슬라이드를 삽입합니다.',
    text: '\n## 발표 제목 {#title .cover eyebrow="Presentation"}\n\n부제와 핵심 메시지를 쓰세요.\n',
  },
  {
    name: 'agenda-slide',
    label: 'Agenda',
    category: 'slide',
    description: '아젠다(목차) 슬라이드를 삽입합니다.',
    text: '\n## Agenda {#agenda .agenda}\n- 1. 배경\n- 2. 핵심 지표\n- 3. 실행 계획\n',
  },
  {
    name: 'message-slide',
    label: 'Key Message',
    category: 'slide',
    description: '한 줄 핵심 메시지 슬라이드를 삽입합니다.',
    text: '\n## 핵심 메시지 {#message .message}\n문제를 해결하는 가장 중요한 문장을 여기에 씁니다.\n{: .lead}\n\n- 근거 1\n- 근거 2\n',
  },
  {
    name: 'compare-slide',
    label: 'Compare 2-up',
    category: 'slide',
    description: '좌우 비교 슬라이드(2단)를 삽입합니다.',
    text: '\n## 전/후 비교 {#compare .compare}\n\n### As-Is\n\n\n### To-Be\n\n',
    layoutCols: ['As-Is', 'To-Be']
  },
  {
    name: 'timeline-slide',
    label: 'Timeline',
    category: 'slide',
    description: '단계별 일정 슬라이드를 삽입합니다.',
    text: '\n## 실행 타임라인 {#timeline .timeline}\n- 1주차 | 요건 정리\n- 2주차 | 시안 제작\n- 3주차 | 검증/피드백\n- 4주차 | 배포\n',
  },
  {
    name: 'data-slide',
    label: 'Data Slide',
    category: 'slide',
    description: '표 중심 데이터 슬라이드를 삽입합니다.',
    text: '\n## 데이터 하이라이트 {#data .card}\n\n| 항목 | 목표 | 실적 |\n| --- | ---: | ---: |\n| 매출 | 100 | 124 |\n| 전환율 | 3.2 | 4.1 |\n{: .zebra .bordered .compact .table-fit caption="월별 성과" emphasis="last-col"}\n',
  },
  {
    name: 'quote-slide',
    label: 'Quote Slide',
    category: 'slide',
    description: '인용/핵심 발언 슬라이드를 삽입합니다.',
    text: '\n## 고객 멘트 {#quote .quote-slide}\n\n> [!INFO] Voice of Customer\n> 이 기능 덕분에 작업 시간이 절반으로 줄었어요.\n',
  },
  {
    name: 'qa-slide',
    label: 'Q&A',
    category: 'slide',
    description: '마무리 Q&A 슬라이드를 삽입합니다.',
    text: '\n## Q&A {#qa .message}\n궁금한 사항을 자유롭게 질문해주세요.\n',
  },
  {
    name: 'page-break',
    label: 'Page Break',
    category: 'utility',
    description: 'HTML 미리보기/저장에서 페이지를 분리하는 마커를 삽입합니다.',
    text: '\n---\n{: .page-break}\n\n',
  },

];

/** 카테고리별 레이블 */
export const SNIPPET_CATEGORIES = {
  basic: '기본',
  layout: '레이아웃',
  content: '콘텐츠',
  slide: '슬라이드',
  utility: '유틸리티',
};
