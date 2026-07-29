# Troubleshooting

Start with the rendered panel’s data state, then isolate the query shape.

| Symptom | Check | Corrective action |
| --- | --- | --- |
| Empty panel | Grafana returned at least one frame and required fields exist | Fix the query or field mapping; validate a fixture |
| Missing links | `source`, `target`, and `value` are non-null and correctly typed | Alias columns and remove invalid rows upstream |
| Unexpected totals | Repeated links, aggregation, filters, and units | Choose the intended aggregation and compare one raw row to one rendered link |
| Broken path stages | Stage order, nulls, and `scopeNodesByStage` | Return ordered non-null stage columns and map them explicitly |
| Playback is sparse or slow | Time buckets, `maxFrames`, and query cardinality | Bucket consistently, reduce range, or lower frame/link limits |
| Circular graph warning | Self-links, cycles, and layout setting | Remove accidental self-links; enable circular layout only when cycles are meaningful |
| Labels overlap | Node count, padding, direction, and sort | Reduce nodes with query aggregation or `topN`; then tune layout |
| Panel is slow | Node/link counts and renderer threshold | Reduce data first; use hybrid rendering only after measuring |

Run:

```bash
python3 .agents/skills/use-sankeyflow/scripts/validate_fixtures.py sample.json
```

Read errors in row order. A valid fixture proves only the JSON contract; it does not prove Grafana field types, query semantics, or a useful visual result. Compare the validator input with Grafana’s inspected data frame when behavior differs.

For contributors, reproduce with a minimal fixture, add or update a focused test, then run the relevant development checks in [development.md](development.md).
