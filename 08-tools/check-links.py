#!/usr/bin/env python3
"""Check that every relative markdown link in this repository resolves.

A broken link in a harness-facing document is worse than no link. The agent
follows the link, finds nothing, and either invents the file or concludes the
contract does not exist.

Usage:
    python3 08-tools/check-links.py            # check every markdown file
    python3 08-tools/check-links.py 07-guides  # check one folder

Link targets that contain an angle-bracket placeholder, for example
"../../02-contracts/collections/<x>.schema.json", are templates, not real
links, and are skipped.

Exit code 0 when every link resolves, 1 otherwise.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
SKIP_DIRS = {"node_modules", ".git", ".composed", "vendor"}
REMOTE_PREFIXES = ("http://", "https://", "mailto:", "tel:", "#")


def is_template(target: str) -> bool:
    """True when the target holds a placeholder and is not a real path."""
    return "<" in target or ">" in target


def collect_files(targets: list[str]) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        base = REPO_ROOT / target
        if not base.exists():
            print(f"check-links: {target} does not exist")
            return []
        if base.is_file():
            files.append(base)
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [
                name
                for name in dirnames
                if name not in SKIP_DIRS and not name.startswith(".")
            ]
            for name in sorted(filenames):
                if name.endswith(".md"):
                    files.append(Path(dirpath) / name)
    return sorted(set(files))


def main(argv: list[str]) -> int:
    targets = argv[1:] or ["."]
    files = collect_files(targets)
    if not files and targets != ["."]:
        return 1

    checked = 0
    broken: list[str] = []

    for path in files:
        text = path.read_text(encoding="utf-8")
        for match in LINK_RE.finditer(text):
            raw = match.group(1).strip()
            if raw.startswith(REMOTE_PREFIXES):
                continue
            if is_template(raw):
                continue
            target = raw.split("#", 1)[0]
            if not target:
                continue
            checked += 1
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                broken.append(f"{path.relative_to(REPO_ROOT)} -> {raw}")

    for line in sorted(set(broken)):
        print(f"!! broken link: {line}")

    print(f"LINKED={checked} BROKEN={len(set(broken))}")

    if broken:
        print("check-links: FAILED")
        return 1

    print("check-links: every relative markdown link resolves")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
