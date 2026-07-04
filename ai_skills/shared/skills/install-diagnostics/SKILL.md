---
name: install-diagnostics
description: Diagnose and prepare missing local dependencies for other Codex skills or project workflows before use. Use when a skill, script, repository task, or user request may require OS-specific setup such as CLI tools, Node/npm packages, Python packages, environment variables, PATH changes, WSL/Ubuntu packages, Windows winget/PowerShell steps, or user-level configuration; also use when Codex should record installation decisions so it does not repeatedly ask about setup already completed.
---

# Install Diagnostics

## Core Rule

Diagnose first. Never install, upgrade, remove, or globally configure dependencies until the user explicitly approves the exact action.

Use this skill to make setup work repeatable across Windows, Ubuntu/Linux, WSL, and macOS. Prefer user-scoped or workspace-scoped setup when it satisfies the task; propose system-wide setup only when necessary.

## Workflow

1. Identify the target workflow, skill, script, or repository command the user wants to run.
2. Read the relevant instructions or files enough to infer required tools, packages, environment variables, services, and permissions.
3. Run `scripts/diagnose_requirements.py` to inspect the current OS, command availability, versions, common developer tools, and prior install history.
4. If the target has extra requirements, create a temporary JSON manifest and rerun the script with `--manifest <path>`.
5. Summarize only missing or risky items, including OS-specific install choices and whether prior history exists.
6. Ask for user approval before running any install or configuration command. Include the exact command(s), scope, and why they are needed.
7. After an approved action, verify with the same diagnostic check.
8. Record the result with `--record` so future runs can avoid asking again when the requirement still verifies.

## Diagnostic Script

Run the built-in baseline check:

```bash
python .codex/skills/install-diagnostics/scripts/diagnose_requirements.py --skill <skill-or-task-name>
```

Run with a requirement manifest:

```bash
python .codex/skills/install-diagnostics/scripts/diagnose_requirements.py --skill <skill-or-task-name> --manifest <requirements.json>
```

Write a successful install record after verifying the install:

```bash
python .codex/skills/install-diagnostics/scripts/diagnose_requirements.py --skill <skill-or-task-name> --record <requirement-id> --status installed --scope user --command "<command that was approved and run>"
```

Record declined or failed attempts too when they affect future decisions:

```bash
python .codex/skills/install-diagnostics/scripts/diagnose_requirements.py --skill <skill-or-task-name> --record <requirement-id> --status declined --scope user --notes "User declined global npm install"
```

History is stored at `~/.codex/install-diagnostics/history.json` unless `--history <path>` is provided. Treat successful history as a hint, not proof; always verify the dependency still exists before skipping setup.

## Requirement Manifest

Use a temporary manifest when a target skill or repository has requirements beyond the baseline probes. Keep ids stable because history is keyed by id, OS, and scope.

```json
{
  "requirements": [
    {
      "id": "node",
      "type": "command",
      "command": "node",
      "version_arg": "--version",
      "reason": "Run the Vite development server",
      "install": {
        "windows": "winget install OpenJS.NodeJS.LTS",
        "ubuntu": "sudo apt-get update && sudo apt-get install -y nodejs npm",
        "macos": "brew install node"
      }
    },
    {
      "id": "npm:playwright",
      "type": "npm-global",
      "package": "playwright",
      "reason": "Drive browser-based verification",
      "install": {
        "all": "npm install -g playwright"
      }
    },
    {
      "id": "python:pdfplumber",
      "type": "python-module",
      "module": "pdfplumber",
      "reason": "Extract text from PDFs",
      "install": {
        "all": "python -m pip install --user pdfplumber"
      }
    },
    {
      "id": "env:OPENAI_API_KEY",
      "type": "env",
      "name": "OPENAI_API_KEY",
      "reason": "Call OpenAI APIs from local scripts"
    }
  ]
}
```

Supported requirement types:

- `command`: checks an executable on `PATH`; optional `version_arg`.
- `npm-global`: checks a globally installed npm package with `npm list -g`.
- `python-module`: checks whether Python can import a module.
- `env`: checks whether an environment variable is set.

## Approval Language

When something is missing, ask in plain language and include:

- the dependency id and reason;
- the detected OS and proposed scope (`user`, `workspace`, or `system`);
- the exact command(s) to run;
- whether there is any previous success, decline, or failure history;
- what will be recorded after verification.

Do not ask again for a requirement that has a successful history record and currently verifies. If it has successful history but no longer verifies, explain that the local environment changed and ask again.

## OS Guidance

On Windows, prefer `winget` for system tools when available, PowerShell profile changes only when necessary, and user environment variables through the least invasive mechanism. Mention when a new terminal may be required for `PATH` changes.

On Ubuntu/Linux or WSL, prefer package-manager commands for system tools and user-level language package installs where possible. Use `sudo` only after user approval and only when the dependency cannot reasonably be installed in user or workspace scope.

For npm, prefer workspace dependencies (`npm install --save-dev <pkg>`) when the package belongs to the project. Use global npm installs only for reusable CLIs that the project does not already manage.

For Python, prefer the repository's existing virtual environment or `python -m pip install --user` when no project environment exists. Avoid mutating system Python packages unless the user explicitly asks.

## Reporting

Keep setup reports brief:

- `Ready`: all requirements verify.
- `Needs approval`: missing dependencies with proposed commands.
- `Blocked`: no safe install path or missing credentials.
- `Recorded`: history update path and status.
