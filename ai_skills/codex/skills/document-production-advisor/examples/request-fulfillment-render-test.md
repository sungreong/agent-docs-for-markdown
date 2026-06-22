---
title: Request Fulfillment Render Test
theme: report
mode: presentation
---

# Request Fulfillment Render Test {#cover .cover}

Can the extension prove that a generated document actually satisfies the user request?

---
{: .page-break}

## Request Contract {: .safe-zone}

| User requirement | Output location | Evidence | Verification |
| --- | --- | --- | --- |
| Blog-safe HTML | Blog embed export | stacked pages, scoped CSS, no fixed viewer controls | render at desktop and narrow width |
| DOCX-like handoff | Outline and tables | sequential headings, real table headers, captions | structural review |
| PPTX-like brief | Slide-style pages | one message per page, readable titles | visual overlap check |
| Korean/CJK text | This row and title below | 요청사항 충족 검증 | UTF-8 and wrapping check |

---
{: .page-break}

## One Message Per Page {: .problem-statement}

The document should not merely look polished. It should make the requested outcome testable.

- Keep every section tied to a user requirement.
- Remove decorative sections that cannot be verified.
- Render before declaring the document ready.

---
{: .page-break}

## 4 Gates {: .big-number-hero}

Request contract, plan trace, rendered UX audit, final truth report.

---
{: .page-break}

## Production Checks {: .feature-grid}

- Required topics are present.
- Tables remain readable on narrow screens.
- Titles wrap without clipping.
- Blog embed output stays scoped.
- DOCX handoff keeps headings and captions.
- PPTX-like pages avoid overlap and dense walls of text.

---
{: .page-break}

## Before / After {: .contrast-pair}

### Before

A nice-looking document that may have missed the user's constraints.

### After

A verified artifact where every major section maps to a user requirement.

---
{: .page-break}

## Final Report Checklist

- State what was satisfied.
- List which files or exports changed.
- Report render checks performed.
- Name any unsupported, skipped, or removed ideas.
