#!/usr/bin/env python3
"""Check that every markdown table in this repository is well formed.

A markdown table is well formed when every row in it has the same number of
pipe separators as its header row. A malformed table renders as a broken grid,
and an AI harness reading it gets the wrong column mapping.

Usage:
    python3 08-tools/check-tables.py            # check every markdown file
    python3 08-tools/check-tables.py 07-guides  # check one folder

Exit code 0 when every table is well formed, 1 otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SEPARATOR_RE = re.compile(r"^\s*\|[\s:|-]+\|\s*$")


def column_count(line: str) -> int:
    """Count the cells in a markdown table row.

    A leading and a trailing pipe are row decoration, not cell separators, so
    the count is the number of unescaped pipes minus one.
    """
    return len(re.findall(r"(?<!\\)\|", line)) - 1


def check_file(path: Path) -> tuple[int, int, list[str]]:
    """Return (tables found, malformed count, error lines) for one file."""
    lines = path.read_text(encoding="utf-8").split("\n")
    errors: list[str] = []
    tables = 0
    index = 0

    while index < len(lines):
        current = lines[index]
        following = lines[index + 1] if index + 1 < len(lines) else ""

        if current.strip().startswith("|") and SEPARATOR_RE.match(following):
            expected = column_count(current)
            cursor = index + 2
            while cursor < len(lines) and lines[cursor].strip().startswith("|"):
                actual = column_count(lines[cursor])
                if actual != expected:
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} L{cursor + 1}: "
                        f"cols={actual} expected={expected}: {lines[cursor].strip()[:100]}"
                    )
                cursor += 1
            tables += 1
            index = cursor
        else:
            index += 1

    return tables, len(errors), errors


def main(argv: list[str]) -> int:
    targets = argv[1:] or ["."]

    files: list[Path] = []
    for target in targets:
        base = REPO_ROOT / target
        if not base.exists():
            print(f"check-tables: {target} does not exist")
            return 1
        if base.is_file():
            files.append(base)
        else:
            files.extend(
                path
                for path in sorted(base.rglob("*.md"))
                if "node_modules" not in path.parts and not any(part.startswith(".") for part in path.parts)
            )

    total_tables = 0
    total_errors = 0

    for path in files:
        tables, errors, messages = check_file(path)
        total_tables += tables
        total_errors += errors
        for message in messages:
            print(f"!! {message}")
        print(f"{path.relative_to(REPO_ROOT)}: {tables} tables, {errors} malformed")

    print(f"TABLES={total_tables} MALFORMED={total_errors}")

    if total_errors:
        print("check-tables: FAILED")
        return 1

    print("check-tables: all markdown tables are well formed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
