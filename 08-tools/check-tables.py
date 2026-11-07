#!/usr/bin/env python3
"""Check that every markdown table in this repository is well formed.

A markdown table is well formed when every row in it has the same number of
pipe separators as its header row. A malformed table renders as a broken grid,
and an AI harness reading it gets the wrong column mapping.

A repeated first cell in a 2-column table is a warning, not an error. A
2-column table is a key/value list: a repeated key means two rows claim the
same thing, and the reader silently gets whichever row they reach first. Wide
tables repeat the first cell by design, so they are not checked this way, and
the warning still exits 0.

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
CELL_SPLIT_RE = re.compile(r"(?<!\\)\|")


def column_count(line: str) -> int:
    """Count the cells in a markdown table row.

    A leading and a trailing pipe are row decoration, not cell separators, so
    the count is the number of unescaped pipes minus one.
    """
    return len(re.findall(r"(?<!\\)\|", line)) - 1


def first_cell(line: str) -> str:
    """Return the first data cell, trimmed. The leading pipe yields an empty
    part at index 0, so the first real cell is index 1."""
    parts = CELL_SPLIT_RE.split(line.strip())
    return parts[1].strip() if len(parts) > 1 else ""


def check_file(path: Path) -> tuple[int, int, int, list[str], list[str]]:
    """Return (tables, malformed, warnings, error lines, warning lines)."""
    lines = path.read_text(encoding="utf-8").split("\n")
    errors: list[str] = []
    warnings: list[str] = []
    tables = 0
    index = 0

    while index < len(lines):
        current = lines[index]
        following = lines[index + 1] if index + 1 < len(lines) else ""

        if current.strip().startswith("|") and SEPARATOR_RE.match(following):
            expected = column_count(current)
            seen: dict[str, int] = {}
            cursor = index + 2
            while cursor < len(lines) and lines[cursor].strip().startswith("|"):
                actual = column_count(lines[cursor])
                if actual != expected:
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} L{cursor + 1}: "
                        f"cols={actual} expected={expected}: {lines[cursor].strip()[:100]}"
                    )
                key = first_cell(lines[cursor])
                # A 2-column table is a key/value list: the first cell is the
                # key, and a repeat is a real conflict. Wider tables repeat
                # the first cell by design ("collection | field | ..."),
                # so they are not a duplicate warning.
                if expected == 2 and key:
                    if key in seen:
                        warnings.append(
                            f"{path.relative_to(REPO_ROOT)} L{cursor + 1}: "
                            f"first cell repeats '{key[:60]}', first seen at L{seen[key]}"
                        )
                    else:
                        seen[key] = cursor + 1
                cursor += 1
            tables += 1
            index = cursor
        else:
            index += 1

    return tables, len(errors), len(warnings), errors, warnings


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
    total_warnings = 0

    for path in files:
        tables, errors, warnings, messages, notes = check_file(path)
        total_tables += tables
        total_errors += errors
        total_warnings += warnings
        for message in messages:
            print(f"!! {message}")
        for note in notes:
            print(f"?? {note}")
        print(f"{path.relative_to(REPO_ROOT)}: {tables} tables, {errors} malformed, {warnings} warning(s)")

    print(f"TABLES={total_tables} MALFORMED={total_errors} WARNINGS={total_warnings}")

    if total_errors:
        print("check-tables: FAILED")
        return 1

    print("check-tables: all markdown tables are well formed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
