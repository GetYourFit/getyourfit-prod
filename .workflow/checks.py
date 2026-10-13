#!/usr/bin/env python3
"""The workflow's checks for a product repository. Vendored into the product as .workflow/checks.py by scripts/adopt-product.

Do not edit the vendored copy: the provenance check fails on any change. Change scripts/kit in the workflow
repository and adopt again. Every check is registered in CHECKS, and tests/test_kit.py fails if a check has no
test named test_<name>_fails_on_known_bad that shows it rejecting bad input. Needs only Python 3.9 or later.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

EM_DASH = chr(0x2014)
SECRET_PATTERNS = {
    "private key": r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----",
    "GitHub token": r"\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}",
    "AWS access key": r"\bAKIA[0-9A-Z]{16}\b",
    "API key": r"\bsk-ant-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}\b|\bAIza[0-9A-Za-z_-]{35}\b",
    "Slack token": r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
    "credential assignment": r"(?i)\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['\"][^'\"\s]{12,}['\"]",
}
TRAILER_PATTERNS = {
    "Co-authored-by trailer": re.compile(r"^\s*co-authored-by:", re.I | re.M),
    "AI attribution line": re.compile(
        r"^.*generated (?:with|by) .*(?:claude|codex|copilot|gpt|gemini|cursor|openai|anthropic|\bai\b).*$",
        re.I | re.M,
    ),
}
KIT_DIR = ".workflow"
PROVENANCE = f"{KIT_DIR}/PROVENANCE"
ACCEPTANCE = f"{KIT_DIR}/acceptance"
HOOKS_DIR = f"{KIT_DIR}/hooks"
CI_WORKFLOW = ".github/workflows/workflow-kit.yml"
# What the hook check demands of each installed file: the commands it must run.
HOOK_COMMANDS = {
    f"{HOOKS_DIR}/pre-commit": (f"{KIT_DIR}/checks.py",),
    f"{HOOKS_DIR}/pre-push": (f"{KIT_DIR}/checks.py", ACCEPTANCE),
    CI_WORKFLOW: (f"{KIT_DIR}/checks.py", ACCEPTANCE),
}


@dataclasses.dataclass
class Ctx:
    root: Path
    rev_range: str | None = None
    env: dict = dataclasses.field(default_factory=lambda: dict(os.environ))
    notes: list = dataclasses.field(default_factory=list)


def git(root, *args, check=False):
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=check)


def read(root, rel):
    try:
        return (root / rel).read_text(encoding="utf-8")
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return None


def text_files(root):
    """Tracked and untracked-but-not-ignored text files, as repo-relative paths."""
    proc = git(root, "ls-files", "--cached", "--others", "--exclude-standard")
    if proc.returncode != 0:
        names = [
            str(p.relative_to(root)) for p in root.rglob("*")
            if p.is_file() and ".git" not in p.relative_to(root).parts
        ]
    else:
        names = [n for n in proc.stdout.split("\n") if n]
    return sorted(n for n in names if read(root, n) is not None)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_secrets(ctx):
    errors = []
    for rel in text_files(ctx.root):
        for n, line in enumerate(read(ctx.root, rel).split("\n"), 1):
            for label, pattern in SECRET_PATTERNS.items():
                if re.search(pattern, line):
                    errors.append(f"{rel}:{n}: looks like a {label}; secrets never enter the repository")
    return errors


def check_pins(ctx):
    errors = []
    for rel in text_files(ctx.root):
        if not re.match(r"^\.github/(workflows/[^/]+|actions/(.+/)?action)\.ya?ml$", rel):
            continue
        scope = None
        for n, line in enumerate(read(ctx.root, rel).split("\n"), 1):
            indent = len(line) - len(line.lstrip())
            if scope and line.strip() and indent <= scope[1]:
                scope = None
            m = re.match(r"^\s*-?\s*uses:\s*['\"]?([^\s'\"#]+)", line)
            if m:
                if m.group(1).startswith("./"):
                    continue
                ref, kind = m.group(1), "action"
                ok = re.search(r"@sha256:[0-9a-f]{64}$", ref) if ref.startswith("docker://") else re.search(r"@[0-9a-f]{40}$", ref)
            else:
                m = re.match(r"^\s*(container|services|image):\s*(?:['\"]?([^\s'\"#]+))?", line)
                if not m:
                    continue
                if m.group(1) != "image":
                    scope = (m.group(1), indent)
                    if not m.group(2) or m.group(1) == "services":
                        continue
                elif not scope:
                    continue
                ref, kind = m.group(2), "container image"
                ok = re.search(r"@sha256:[0-9a-f]{64}$", ref or "")
            if not ok:
                what = "a full commit SHA" if kind == "action" else "an image digest"
                errors.append(f"{rel}:{n}: {kind} {ref} must be pinned to {what}")
    return errors


def check_em_dash(ctx):
    errors = []
    for rel in text_files(ctx.root):
        for n, line in enumerate(read(ctx.root, rel).split("\n"), 1):
            if EM_DASH in line:
                errors.append(f"{rel}:{n}: em dash found, use a plain dash '-'")
    return errors


def adoption_anchor(root):
    """The commit that first added the provenance record: only commits after it are the product's new work."""
    proc = git(root, "log", "--diff-filter=A", "--format=%H", "HEAD", "--", PROVENANCE)
    shas = proc.stdout.split() if proc.returncode == 0 else []
    return shas[-1] if shas else None


def log_messages(ctx, *revs):
    return git(ctx.root, "log", "--format=%H%x00%B%x01", *revs)


def check_trailers(ctx):
    anchor = adoption_anchor(ctx.root)
    bound = [f"^{anchor}"] if anchor else []
    requested = ctx.rev_range or ctx.env.get("WF_RANGE")
    proc = log_messages(ctx, requested, *bound) if requested else None
    if proc is not None and proc.returncode != 0 and not ctx.rev_range:
        ctx.notes.append(f"trailers: {requested} is not usable here, checking since adoption instead")
        proc = None
    if proc is None:
        if not anchor:
            ctx.notes.append(f"trailers: {PROVENANCE} is not committed yet, no commit to check")
            return []
        requested = f"{anchor[:10]}..HEAD"
        proc = log_messages(ctx, "HEAD", *bound)
    if proc.returncode != 0:
        return [f"git log {requested} failed: {proc.stderr.strip()}"]
    ctx.notes.append(f"trailers: checked {proc.stdout.count(chr(1))} commits in {requested}")
    errors = []
    for entry in filter(None, proc.stdout.split("\x01")):
        sha, _, body = entry.strip("\n").partition("\x00")
        for label, pattern in TRAILER_PATTERNS.items():
            if pattern.search(body):
                errors.append(f"commit {sha[:10]}: {label}, remove it from the message")
    return errors


def executable(root, rel):
    return (root / rel).is_file() and os.access(root / rel, os.X_OK)


def run_blocks(rel, text):
    """The shell command lists a file runs: the whole file for a hook script, each step's run value for a workflow."""
    if not rel.endswith((".yml", ".yaml")):
        return [text.split("\n")]
    blocks, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        m = re.match(r"^(\s*)(?:-\s+)?run:\s*(.*)$", lines[i])
        i += 1
        if not m:
            continue
        indent, value = len(m.group(1)), m.group(2).strip()
        if not re.fullmatch(r"[|>][+-]?", value):
            blocks.append([value])
            continue
        body = []
        while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > indent):
            body.append(lines[i])
            i += 1
        blocks.append(body)
    return blocks


def runs_command(block, command):
    """True when a line of the block runs the command before any exit; comments, echo and later lines do not count."""
    for line in block:
        try:
            words = shlex.split(line, comments=True)
        except ValueError:
            continue
        if "exit" in words:
            return False
        if words[:1] == ["exec"]:
            words = words[1:]
        if words[:1] in (["python3"], ["python"], ["sh"], ["bash"]):
            words = words[1:]
        if words and (words[0] == command or words[0].endswith("/" + command)):
            return True
    return False


def check_hook(ctx):
    """The acceptance hook is present, is run by the git hooks and by CI, and this clone has the git hooks switched on."""
    errors = []
    if not (ctx.root / ACCEPTANCE).is_file():
        errors.append(f"{ACCEPTANCE} is missing, add the script that exits 0 when the product's acceptance checks pass")
    elif not executable(ctx.root, ACCEPTANCE):
        errors.append(f"{ACCEPTANCE} is not executable, run: chmod +x {ACCEPTANCE}")
    for rel, commands in HOOK_COMMANDS.items():
        text = read(ctx.root, rel)
        if text is None:
            errors.append(f"{rel} is missing, run scripts/adopt-product from the workflow repository")
            continue
        for command in commands:
            if not any(runs_command(block, command) for block in run_blocks(rel, text)):
                errors.append(f"{rel} does not run {command}")
        if rel.startswith(HOOKS_DIR) and not executable(ctx.root, rel):
            errors.append(f"{rel} is not executable, run: chmod +x {rel}")
    if not ctx.env.get("CI") and (ctx.root / ".git").exists():
        path = git(ctx.root, "config", "--get", "core.hooksPath").stdout.strip()
        if path.rstrip("/") != HOOKS_DIR:
            record, _ = provenance_record(ctx.root)
            if record and record.get("hooks_opted_out") is True:
                ctx.notes.append(f"hook: hooks-not-enabled, explicitly opted out in {PROVENANCE} (core.hooksPath is {path or 'unset'}); CI still enforces all checks")
            else:
                errors.append(f"git hooks are not switched on in this clone (core.hooksPath is {path or 'unset'}), run: python3 {KIT_DIR}/checks.py install-hooks")
    return errors


def provenance_record(root):
    text = read(root, PROVENANCE)
    if text is None:
        return None, f"{PROVENANCE} is missing, run scripts/adopt-product from the workflow repository"
    try:
        record = json.loads(text)
        if not (isinstance(record["sha"], str) and re.fullmatch(r"[0-9a-f]{40}", record["sha"]) and isinstance(record["files"], dict)):
            raise ValueError("sha must be a 40 character commit id and files an object")
    except (ValueError, KeyError, TypeError) as e:
        return None, f"{PROVENANCE} is not valid: {e}"
    return record, None


def check_provenance(ctx):
    """Every vendored file is the workflow's file at the recorded commit. A local edit fails here and is made in the workflow repository."""
    record, error = provenance_record(ctx.root)
    if error:
        return [error]
    errors = []
    for rel, digest in sorted(record["files"].items()):
        if not (ctx.root / rel).is_file():
            errors.append(f"{rel} is recorded in {PROVENANCE} but missing, run scripts/adopt-product from the workflow repository")
        elif sha256(ctx.root / rel) != digest:
            errors.append(f"{rel} differs from workflow commit {record['sha'][:10]}, change scripts/kit in the workflow repository and adopt again")
    ctx.notes.append(f"provenance: vendored from workflow commit {record['sha']}")
    return errors


def install_hooks(root):
    done = git(root, "config", "core.hooksPath", HOOKS_DIR)
    if done.returncode != 0:
        print(f"cannot set core.hooksPath: {done.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"core.hooksPath is now {HOOKS_DIR}")
    return 0


CHECKS = {
    "secrets": check_secrets,
    "pins": check_pins,
    "em-dash": check_em_dash,
    "trailers": check_trailers,
    "hook": check_hook,
    "provenance": check_provenance,
}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("command", nargs="?", choices=["check", "install-hooks"], default="check")
    ap.add_argument("--root", type=Path, default=Path.cwd())
    ap.add_argument("--only", choices=sorted(CHECKS), action="append")
    ap.add_argument("--range", dest="rev_range", help="commit range for the trailers check")
    args = ap.parse_args(argv)
    root = args.root.resolve()
    if args.command == "install-hooks":
        return install_hooks(root)
    ctx = Ctx(root, args.rev_range)
    failed = 0
    for name in args.only or CHECKS:
        errors = CHECKS[name](ctx)
        print(f"{'FAIL' if errors else 'ok  '} {name}")
        for e in errors:
            print(f"  {e}")
        failed += bool(errors)
    for note in ctx.notes:
        print(f"note: {note}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
