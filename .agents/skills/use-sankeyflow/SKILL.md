---
name: use-sankeyflow
description: Help dashboard users and SankeyFlow contributors shape, validate, query, troubleshoot, develop, and sign the Grafana SankeyFlow panel. Use for edge or multi-stage path data, time playback, panel limits, dependency-free fixture validation, contributor workflows, or release signing.
---

# Use SankeyFlow

Use this skill to move from Grafana query output to a valid SankeyFlow dashboard or a safe plugin change. Keep the data contract explicit, validate fixtures before building, and load only the reference needed for the task.

## Choose the workflow

- Build or review dashboard data: read [data-contract.md](references/data-contract.md), then use [query-recipes.md](references/query-recipes.md).
- Diagnose an empty, malformed, slow, or misleading panel: read [troubleshooting.md](references/troubleshooting.md), then run `scripts/validate_fixtures.py` against representative JSON.
- Change plugin code or tests: read [development.md](references/development.md); preserve unrelated work and use the repository’s existing webpack/test commands.
- Prepare a distributable release: read [deployment-signing.md](references/deployment-signing.md).

## Quick validation

Run the validator without importing the unbuilt plugin:

```bash
python3 .agents/skills/use-sankeyflow/scripts/validate_fixtures.py fixture.json
```

Pass one or more JSON fixtures. Require each fixture to declare `mode` as `edges` or `paths` and to contain a `rows` array. Treat non-zero exit status as a data-contract failure; inspect the stable JSON report before changing panel options.

## Operating rules

1. Choose `edges` for explicit source-target rows; choose `paths` for one row per multi-stage journey.
2. Map fields by name in Grafana rather than relying on column order.
3. Keep values numeric, finite, and non-negative; use a consistent unit and aggregation.
4. Supply a time field only when playback or time bucketing is intended.
5. Apply `minimumValue`, `topN`, `maxNodes`, `maxLinks`, and `maxFrames` deliberately; document any lossy reduction.
6. Investigate diagnostics before hiding them with display settings.
7. Never invent a semantic correction for invalid flow data. Remove the row in a clearly labeled example or ask how the source should be repaired.
8. For code changes, validate fixtures first, then typecheck, test, lint, and build in proportion to the change.

## Reference loading

Load references progressively. Do not read every reference for a simple dashboard question. Keep examples aligned with the JSON contract and avoid importing TypeScript from `src/` in validation scripts.
