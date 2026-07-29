#!/usr/bin/env python3
"""Validate SankeyFlow edge/path JSON fixtures without importing the plugin."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


def error(row: int | None, message: str) -> dict[str, Any]:
    result: dict[str, Any] = {"message": message}
    if row is not None:
        result["row"] = row
    return result


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def timestamp(value: Any) -> bool:
    if finite_number(value):
        return True
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def validate(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"file": str(path), "valid": False, "errors": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        result["errors"] = [error(None, f"cannot read JSON: {exc}")]
        return result

    if not isinstance(payload, dict):
        result["errors"] = [error(None, "fixture root must be an object")]
        return result

    mode = payload.get("mode")
    rows = payload.get("rows")
    errors: list[dict[str, Any]] = []
    if mode not in {"edges", "paths"}:
        errors.append(error(None, "mode must be 'edges' or 'paths'"))
    if not isinstance(rows, list) or not rows:
        errors.append(error(None, "rows must be a non-empty array"))
    if errors:
        result["errors"] = errors
        return result

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(error(index, "row must be an object"))
            continue
        value = row.get("value")
        if not finite_number(value):
            errors.append(error(index, "value must be a finite number"))
        elif value < 0:
            errors.append(error(index, "value must be non-negative"))
        if "time" in row and not timestamp(row["time"]):
            errors.append(error(index, "time must be a finite number or ISO timestamp when present"))

        if mode == "edges":
            source, target = row.get("source"), row.get("target")
            if not nonempty_string(source):
                errors.append(error(index, "source must be a non-empty string"))
            if not nonempty_string(target):
                errors.append(error(index, "target must be a non-empty string"))
            if nonempty_string(source) and nonempty_string(target) and source == target:
                errors.append(error(index, "source and target must differ"))
        else:
            stages = row.get("stages")
            if not isinstance(stages, list) or len(stages) < 2:
                errors.append(error(index, "stages must be an array with at least two items"))
            elif any(not nonempty_string(stage) for stage in stages):
                errors.append(error(index, "every stage must be a non-empty string"))

        for field in ("nodeGroup", "linkGroup", "label"):
            if field in row and not isinstance(row[field], str):
                errors.append(error(index, f"{field} must be a string when present"))

    result["mode"] = mode
    result["rows"] = len(rows)
    result["errors"] = errors
    result["valid"] = not errors
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixtures", nargs="+", type=Path, help="JSON fixture files")
    args = parser.parse_args()
    reports = [validate(path) for path in args.fixtures]
    print(json.dumps({"valid": all(report["valid"] for report in reports), "fixtures": reports}, indent=2))
    return 0 if all(report["valid"] for report in reports) else 1


if __name__ == "__main__":
    sys.exit(main())
