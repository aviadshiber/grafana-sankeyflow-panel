# SankeyFlow data contract

Use a JSON fixture with this envelope:

```json
{
  "mode": "edges",
  "rows": [
    {"source": "Ads", "target": "Checkout", "value": 42}
  ]
}
```

## Edge mode

Provide one row per link:

| Field | Required | Rule |
| --- | --- | --- |
| `source` | yes | Non-empty string node ID |
| `target` | yes | Non-empty string node ID; do not self-link |
| `value` | yes | Finite number, `>= 0` |
| `time` | no | Finite numeric timestamp or bucket key |
| `nodeGroup`, `linkGroup`, `label` | no | String metadata |

Aggregate repeated source-target rows with the selected `sum`, `mean`, `max`, `last`, or `lastNotNull` policy. Keep source and target values stable across time buckets.

## Path mode

Provide one row per path:

```json
{
  "mode": "paths",
  "rows": [
    {"stages": ["Visit", "Signup", "Paid"], "value": 12, "time": 1710000000000}
  ]
}
```

Require at least two non-empty stage names and a finite, non-negative `value`. Use `scopeNodesByStage: true` when the same label represents different nodes at different stages; use `false` only when labels intentionally share identity across stages. Map tooltip fields separately from stage fields.

## Grafana mapping

Return fields with stable names and compatible types. Map edge fields to `source`, `target`, `value`, and optional `time`; map path fields to an ordered `stages` list, `value`, and optional `time`. Avoid mixing edge and path columns in one query unless `dataMode: auto` can identify the shape unambiguously.

Treat negative, null, non-finite, missing, and self-link rows as diagnostics or rejected input. Keep JSON fixtures small and representative; the bundled validator checks structure without loading Grafana or the unbuilt plugin.
