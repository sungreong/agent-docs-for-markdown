#!/usr/bin/env python3
"""Diagnose local setup requirements and record install decisions.

The script never installs anything. It checks availability, suggests manifest
commands, and maintains a small history file for future Codex runs.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import util as importlib_util
from pathlib import Path
from typing import Any


DEFAULT_HISTORY = Path.home() / ".codex" / "install-diagnostics" / "history.json"


@dataclass
class Requirement:
    id: str
    type: str
    reason: str = ""
    command: str | None = None
    version_arg: str | None = None
    package: str | None = None
    module: str | None = None
    name: str | None = None
    install: dict[str, str] | None = None


def os_key() -> str:
    system = platform.system().lower()
    if system == "windows":
        return "windows"
    if system == "darwin":
        return "macos"
    if system == "linux":
        if "microsoft" in platform.release().lower() or "WSL_DISTRO_NAME" in os.environ:
            return "ubuntu"
        return "ubuntu"
    return system or "unknown"


def run_command(args: list[str], timeout: int = 8) -> tuple[int, str]:
    command = args
    if platform.system().lower() == "windows" and args:
        suffix = Path(args[0]).suffix.lower()
        if suffix in {".cmd", ".bat"}:
            command = ["cmd", "/c", *args]
    try:
        proc = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except Exception as exc:  # noqa: BLE001 - diagnostics should not crash on probe errors.
        return 1, str(exc)
    output = (proc.stdout or proc.stderr or "").strip()
    return proc.returncode, output


def load_history(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return data
    return []


def save_history(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def latest_history(
    records: list[dict[str, Any]],
    requirement_id: str,
    os_name: str,
    skill: str,
) -> dict[str, Any] | None:
    matches = [
        item
        for item in records
        if item.get("requirement_id") == requirement_id
        and item.get("os") == os_name
        and (item.get("skill") in {skill, "*"} or item.get("status") == "installed")
    ]
    if not matches:
        return None
    return sorted(matches, key=lambda item: item.get("timestamp", ""))[-1]


def baseline_requirements() -> list[Requirement]:
    return [
        Requirement(
            id="git",
            type="command",
            command="git",
            version_arg="--version",
            reason="Inspect repositories and version-control changes.",
            install={
                "windows": "winget install Git.Git",
                "ubuntu": "sudo apt-get update && sudo apt-get install -y git",
                "macos": "brew install git",
            },
        ),
        Requirement(
            id="rg",
            type="command",
            command="rg",
            version_arg="--version",
            reason="Search code and documents quickly.",
            install={
                "windows": "winget install BurntSushi.ripgrep.MSVC",
                "ubuntu": "sudo apt-get update && sudo apt-get install -y ripgrep",
                "macos": "brew install ripgrep",
            },
        ),
        Requirement(
            id="python",
            type="command",
            command="python",
            version_arg="--version",
            reason="Run local diagnostic and automation scripts.",
            install={
                "windows": "winget install Python.Python.3.12",
                "ubuntu": "sudo apt-get update && sudo apt-get install -y python3 python3-pip",
                "macos": "brew install python",
            },
        ),
        Requirement(
            id="node",
            type="command",
            command="node",
            version_arg="--version",
            reason="Run JavaScript tooling when a skill or repository needs it.",
            install={
                "windows": "winget install OpenJS.NodeJS.LTS",
                "ubuntu": "sudo apt-get update && sudo apt-get install -y nodejs npm",
                "macos": "brew install node",
            },
        ),
        Requirement(
            id="npm",
            type="command",
            command="npm",
            version_arg="--version",
            reason="Install or run project-managed JavaScript packages.",
            install={
                "windows": "winget install OpenJS.NodeJS.LTS",
                "ubuntu": "sudo apt-get update && sudo apt-get install -y npm",
                "macos": "brew install node",
            },
        ),
    ]


def requirement_from_dict(item: dict[str, Any]) -> Requirement:
    return Requirement(
        id=str(item["id"]),
        type=str(item["type"]),
        reason=str(item.get("reason", "")),
        command=item.get("command"),
        version_arg=item.get("version_arg"),
        package=item.get("package"),
        module=item.get("module"),
        name=item.get("name"),
        install=item.get("install") if isinstance(item.get("install"), dict) else None,
    )


def load_manifest(path: Path) -> list[Requirement]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else data.get("requirements", [])
    return [requirement_from_dict(item) for item in items]


def install_suggestion(req: Requirement, os_name: str) -> str | None:
    if not req.install:
        return None
    return req.install.get(os_name) or req.install.get("linux" if os_name == "ubuntu" else os_name) or req.install.get("all")


def check_requirement(req: Requirement) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": req.id,
        "type": req.type,
        "ok": False,
        "version": None,
        "detail": "",
        "reason": req.reason,
    }
    if req.type == "command":
        if not req.command:
            result["detail"] = "missing command field"
            return result
        path = shutil.which(req.command)
        if not path:
            result["detail"] = f"{req.command} not found on PATH"
            return result
        result["ok"] = True
        result["detail"] = path
        if req.version_arg:
            code, output = run_command([path, req.version_arg])
            if code == 0 and output:
                result["version"] = output.splitlines()[0]
        return result

    if req.type == "npm-global":
        if not req.package:
            result["detail"] = "missing package field"
            return result
        npm_path = shutil.which("npm")
        if not npm_path:
            result["detail"] = "npm not found on PATH"
            return result
        code, output = run_command([npm_path, "list", "-g", req.package, "--depth=0", "--json"], timeout=20)
        result["ok"] = code == 0 and f'"{req.package}"' in output
        result["detail"] = "installed globally" if result["ok"] else f"{req.package} not found globally"
        return result

    if req.type == "python-module":
        module = req.module or req.package
        if not module:
            result["detail"] = "missing module field"
            return result
        result["ok"] = importlib_util.find_spec(module) is not None
        result["detail"] = "importable" if result["ok"] else f"{module} is not importable"
        return result

    if req.type == "env":
        if not req.name:
            result["detail"] = "missing name field"
            return result
        value = os.environ.get(req.name)
        result["ok"] = bool(value)
        result["detail"] = "set" if value else "not set"
        return result

    result["detail"] = f"unsupported requirement type: {req.type}"
    return result


def record_status(args: argparse.Namespace, history_path: Path, os_name: str) -> None:
    records = load_history(history_path)
    records.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "skill": args.skill,
            "requirement_id": args.record,
            "status": args.status,
            "scope": args.scope,
            "os": os_name,
            "command": args.command or "",
            "notes": args.notes or "",
        }
    )
    save_history(history_path, records)
    print(json.dumps({"recorded": args.record, "status": args.status, "history": str(history_path)}, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Diagnose setup requirements without installing anything.")
    parser.add_argument("--skill", default="*", help="Skill or task name associated with this diagnostic run.")
    parser.add_argument("--manifest", help="JSON file describing extra requirements.")
    parser.add_argument("--history", default=str(DEFAULT_HISTORY), help="Install history JSON path.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON only.")
    parser.add_argument("--record", help="Requirement id to append to install history.")
    parser.add_argument("--status", choices=["installed", "declined", "failed", "skipped"], default="installed")
    parser.add_argument("--scope", choices=["user", "workspace", "system", "unknown"], default="unknown")
    parser.add_argument("--command", help="Approved command that was run or proposed.")
    parser.add_argument("--notes", help="Additional notes for the history record.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    history_path = Path(args.history).expanduser()
    current_os = os_key()

    if args.record:
        record_status(args, history_path, current_os)
        return 0

    requirements = baseline_requirements()
    if args.manifest:
        requirements.extend(load_manifest(Path(args.manifest)))

    history = load_history(history_path)
    results = []
    for req in requirements:
        check = check_requirement(req)
        history_item = latest_history(history, req.id, current_os, args.skill)
        check["history"] = history_item
        check["suggested_install"] = install_suggestion(req, current_os)
        results.append(check)

    report = {
        "skill": args.skill,
        "os": current_os,
        "platform": platform.platform(),
        "history": str(history_path),
        "ready": all(item["ok"] for item in results),
        "requirements": results,
    }

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0 if report["ready"] else 2

    print(f"Install diagnostics for {args.skill}")
    print(f"OS: {current_os} ({platform.platform()})")
    print(f"History: {history_path}")
    print("")
    for item in results:
        mark = "OK" if item["ok"] else "MISSING"
        print(f"[{mark}] {item['id']} - {item['detail']}")
        if item.get("version"):
            print(f"  version: {item['version']}")
        if item.get("reason"):
            print(f"  reason: {item['reason']}")
        if item.get("history"):
            hist = item["history"]
            print(f"  last history: {hist.get('status')} at {hist.get('timestamp')} ({hist.get('scope')})")
        if not item["ok"] and item.get("suggested_install"):
            print(f"  suggested install: {item['suggested_install']}")
    return 0 if report["ready"] else 2


if __name__ == "__main__":
    sys.exit(main())
