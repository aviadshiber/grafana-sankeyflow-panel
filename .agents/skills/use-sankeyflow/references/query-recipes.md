# Query recipes

Return the narrowest shape that matches the visualization.

## Explicit edges

Use this shape for a known graph:

```sql
SELECT
  source_node AS source,
  target_node AS target,
  SUM(amount) AS value
FROM flow_events
WHERE $__timeFilter(event_time)
GROUP BY source_node, target_node;
```

Map `source`, `target`, and `value`. Add `event_time AS time` only for playback or bucketed snapshots.

## Multi-stage paths

Use one ordered stage column per hop:

```sql
SELECT
  landing_page AS stage_1,
  signup_plan AS stage_2,
  payment_state AS stage_3,
  COUNT(*) AS value
FROM funnel_events
WHERE $__timeFilter(event_time)
GROUP BY landing_page, signup_plan, payment_state;
```

Map `[stage_1, stage_2, stage_3]` in `pathFields.stages`. Filter or coalesce missing stages upstream; do not turn null into a node named `"null"`.

## Time playback

Bucket timestamps in the query and return one row per bucket and flow:

```sql
SELECT
  $__timeGroup(event_time, '5m') AS time,
  source_node AS source,
  target_node AS target,
  SUM(amount) AS value
FROM flow_events
WHERE $__timeFilter(event_time)
GROUP BY time, source_node, target_node
ORDER BY time;
```

Set playback mode, bucket size, and a practical `maxFrames`. Keep bucket size and query grouping identical to avoid duplicate or sparse frames.

## Query hygiene

- Filter the dashboard time range with `$__timeFilter`.
- Bound high-cardinality dimensions before `topN` if the database can do it cheaper.
- Keep units consistent; do not mix counts and bytes in one graph.
- Include a stable label or group only when the panel needs it for color or tooltips.
- Validate a saved JSON sample with `scripts/validate_fixtures.py` before wiring the panel.
