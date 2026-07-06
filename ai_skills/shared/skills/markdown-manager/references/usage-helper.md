# Agent Docs Usage Helper

Use this reference when the user asks how to start, which skill to use, how Source Graph fits into agent work, or what prompt they should copy into an AI chat.

## First-Time Setup

1. Open the Markdown workspace in VS Code.
2. Run `Agent Docs: Initialize Source Graph` so the workspace has `.mps/source-graph.sqlite`.
3. Run `Agent Docs: Install or Export Skills`.
4. Choose `Install recommended Manager + Writer skills`.
5. Confirm the target agent folder contains both skills, for example `.codex/skills/markdown-manager` and `.codex/skills/markdown-writer`.
6. Ask the agent to use the right skill at the start of the prompt.

Do not assume installation is complete. If the user asks for verification, check the relevant skill folder and graph DB path. If they only ask for guidance, explain the workflow without running graph commands.

## Which Skill To Use

Use `markdown-manager` for corpus intelligence:

- find what the workspace says;
- inspect Source Graph links, backlinks, headings, and related documents;
- plan which documents should be updated together;
- repair links or stale URL references;
- decide `.mps/.mpsignore` exclusions;
- choose canonical Markdown pages.

Use `markdown-writer` for reader-facing artifacts:

- write or rewrite reports, briefs, tutorials, and proposals;
- make presentation-style Markdown or deck-ready pages;
- improve visual structure, frontmatter, tables, and figures;
- render or export-check standalone HTML, blog embed HTML, DOCX handoff, or slide-like pages.

If a request combines both, gather evidence with `markdown-manager` first, then hand the writing part to `markdown-writer`.

## Copy-Paste Prompts

First-time explanation:

```text
Use markdown-manager.

I am new to Agent Docs. Explain how to use Source Graph and the bundled skills in this workspace.
Tell me when to use markdown-manager, when to use markdown-writer, and give me copy-paste prompts.
Do not run searches unless you need to verify installation.
```

Before editing a document:

```text
Use markdown-manager.

Before I edit @path/to/file.md, use Source Graph evidence to find related documents, backlinks, outbound links, broken links, and files that may need to change together.
Return paths, why each matters, heading evidence, link evidence, and next actions.
```

Writing a report or deck:

```text
Use markdown-writer.

Turn @brief.md into a polished Agent Docs Markdown report.
Keep exact facts, links, tables, and source notes.
Set frontmatter, improve structure, and include a render/export readiness check.
```

Combined research-to-writing workflow:

```text
Use markdown-manager first, then markdown-writer.

First gather Source Graph evidence and the minimum reading bundle for this topic.
After the evidence plan is clear, use markdown-writer to produce the final report.
```

## Verification Prompts

When users suspect setup is missing, suggest:

```text
Use markdown-manager.

Check whether this workspace has Source Graph initialized and whether markdown-manager and markdown-writer are installed for this agent.
If something is missing, tell me the exact VS Code command or folder to fix.
```

For graph-oriented checks, the agent may verify:

- `.mps/source-graph.sqlite` exists after initialization;
- `.codex/skills/markdown-manager`, `.agents/skills/markdown-manager`, or the active agent folder exists;
- `.codex/skills/markdown-writer`, `.agents/skills/markdown-writer`, or the active agent folder exists;
- the installed manager script can run `search`, `related`, `neighbors`, and `audit`.

## Answer Style

Return a short, practical answer. Lead with the next prompt the user can copy, then add the minimum explanation needed to choose between manager and writer. Avoid exposing every internal low-level skill unless the user asks for advanced routing details.
