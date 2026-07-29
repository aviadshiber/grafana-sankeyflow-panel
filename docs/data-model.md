# Data model and panel contract

This document defines the input and interaction contract for SankeyFlow. Grafana data frames are normalized into a graph before layout and rendering. Field names below are logical names; configure the panel’s field mapping to match your query output.

## Edge schema

Each row represents one directed edge:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `source` | yes | string | Source node identifier. |
| `target` | yes | string | Destination node identifier. |
| `value` | yes | number | Non-negative flow magnitude. |
| `time` | no | timestamp/number | Timestamp used for playback bucketing. |
| `nodeGroup` | no | string | Group used for node styling or filtering. |
| `linkGroup` | no | string | Group used for link styling or filtering. |
| `label` | no | string | Human-readable label for the edge. |

Additional columns may be selected as tooltip fields. Their original row values remain available as provenance for inspection and data links.

Example:

```csv
source,target,value,time,nodeGroup,linkGroup,label
Checkout,Payment,120,2026-07-29T10:00:00Z,commerce,success,authorized
Payment,Fulfillment,112,2026-07-29T10:00:00Z,commerce,success,accepted
Payment,Declined,8,2026-07-29T10:00:00Z,commerce,exception,rejected
```

Rows with missing endpoints, non-numeric values, negative values, or non-finite values are reported as diagnostics and are not rendered. A self-link is reported separately because it cannot be laid out as a normal transition.

## Path schema

Path mode represents one complete route through ordered stages. Configure one or more stage fields plus an optional value and time field:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `stage_1` … `stage_n` | yes | string | Ordered node values at each stage. |
| `value` | yes | number | Non-negative path magnitude. |
| `time` | no | timestamp/number | Timestamp used for playback bucketing. |

Example:

```csv
region,service, outcome,value,time
eu-west,checkout,success,94,2026-07-29T10:00:00Z
eu-west,checkout,failure,6,2026-07-29T10:00:00Z
us-east,checkout,success,121,2026-07-29T10:00:00Z
```

Every adjacent pair in a path becomes an edge. By default, nodes are scoped by stage, so a value such as `success` in stage 3 does not collide with a same-named value in another stage. Disable stage scoping only when intentionally modeling a shared node identity.

## Mode and aggregation

`dataMode` can be `auto`, `edges`, or `paths`. Auto mode uses the configured mappings and available fields; use an explicit mode when a data frame could match both shapes.

When multiple rows normalize to the same edge, the panel aggregates values using `sum`, `mean`, `max`, `last`, or `lastNotNull`. Aggregation happens before layout. The resulting link keeps the source rows as provenance for details and diagnostics.

## Circular flows

Circular flows are directed links that return to an earlier stage or node, such as `Cache → Service → Cache`. Enable circular layout support when feedback loops are meaningful. SankeyFlow preserves direction and renders return links with a dedicated gap so they remain distinguishable from forward flow.

Cycles are valid input. They are not treated as malformed data. A cycle diagnostic is emitted to make the graph topology explicit, while missing, invalid, or over-limit data remains actionable through diagnostics.

## Playback

Playback uses the optional `time` field to build ordered frames. Configure:

- `snapshot` to render the selected time range as one aggregate graph.
- `playback` to render one graph per time bucket.
- `bucketSizeMs` to choose bucket width; the default is one minute.
- `speed`, `loop`, and `autoplay` to control animation behavior.
- `maxFrames` to cap work and keep dashboards responsive.

Rows without a time value participate in snapshot mode but are excluded from playback frames. Playback is a visualization of the normalized data; it does not mutate the underlying Grafana query or dashboard state. Respect the user’s reduced-motion preference when animation is enabled.

## Selection and accessibility

Selecting a node or link can highlight its connected path, expose provenance, and copy a stable text representation when copy is enabled. Search and minimum-value/top-N controls affect presentation only; they do not change the query result.

Enable the accessible table for a non-visual representation of nodes, links, values, and diagnostics. High-contrast and reduced-motion settings should be treated as user accessibility preferences, not merely display options.

## Limits and diagnostics

The performance contract provides configurable maximums for nodes, links, and playback frames. When a limit is exceeded, SankeyFlow reports a `limit-exceeded` diagnostic rather than silently rendering an incomplete graph. Diagnostics identify severity and, where available, the source frame and row.
