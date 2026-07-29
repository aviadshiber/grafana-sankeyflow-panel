#!/usr/bin/env python3
"""Dependency-free contract tests for the SankeyFlow fixture validator."""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(SCRIPT_DIR))

from validate_fixtures import validate  # noqa: E402


def main() -> int:
    fixture_dir = SKILL_DIR / "fixtures"
    valid_paths = [fixture_dir / "valid-edges.json", fixture_dir / "valid-paths.json"]
    invalid_paths = [fixture_dir / "invalid-edges.json", fixture_dir / "invalid-paths.json"]

    valid_reports = [validate(path) for path in valid_paths]
    invalid_reports = [validate(path) for path in invalid_paths]
    if not all(report["valid"] for report in valid_reports):
        raise AssertionError(json.dumps(valid_reports, indent=2))
    if any(report["valid"] for report in invalid_reports):
        raise AssertionError(json.dumps(invalid_reports, indent=2))

    print(json.dumps({"valid": valid_reports, "invalid": invalid_reports}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
