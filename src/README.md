# SankeyFlow

SankeyFlow turns ordinary Grafana data frames into interactive Sankey diagrams.
Use it for service traffic, energy distribution, conversion funnels, financial
flows, state transitions, and any other directed movement between categories.

![SankeyFlow edge diagram and panel configuration](https://raw.githubusercontent.com/aviadshiber/grafana-sankeyflow-panel/main/src/img/sankeyflow-overview.png)

## What it supports

- Explicit `source → target` edge data and ordered multi-stage paths
- Circular flows and feedback loops
- Snapshot and time-bucketed playback
- Search, keyboard selection, path highlighting, and copyable details
- SVG rendering and a hybrid Canvas/SVG mode for larger graphs
- High-contrast patterns, reduced motion, and an optional accessible data table
- Configurable aggregation, layout, limits, colors, labels, and field mappings

## Required data

For edge mode, return one row per directed link:

```text
source,target,value[,time][,nodeGroup][,linkGroup][,label]
Checkout,Payment,120,2026-07-29T10:00:00Z,commerce,success,authorized
```

For path mode, return one row per ordered journey and map at least two stage
fields plus a non-negative numeric value:

```text
stage_1,stage_2,stage_3,value[,time]
Visit,Signup,Paid,42,2026-07-29T10:00:00Z
```

Rows with missing endpoints, invalid or negative values, and self-links are
reported as diagnostics instead of being silently misrepresented.

## Get started

1. Add a SankeyFlow visualization to a panel.
2. Query data in edge or path form.
3. Choose **Auto**, **Edges**, or **Paths** under **Data**.
4. Map the fields explicitly when their names differ from the examples.
5. Enable **Playback** only when the query returns a time field.

For exact aggregation, playback, circular-flow, and limit semantics, read the
[data contract](https://github.com/aviadshiber/grafana-sankeyflow-panel/blob/main/docs/data-model.md).

## Compatibility and support

SankeyFlow requires Grafana 11.5.2 or newer. Because this release is marked
alpha, self-managed Grafana administrators must enable alpha plugins. The
project tests supported versions through Grafana's Playwright plugin test
matrix.

- [Documentation](https://github.com/aviadshiber/grafana-sankeyflow-panel#readme)
- [Report a bug](https://github.com/aviadshiber/grafana-sankeyflow-panel/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/aviadshiber/grafana-sankeyflow-panel/issues/new?template=feature_request.md)
- [Contribute](https://github.com/aviadshiber/grafana-sankeyflow-panel/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/aviadshiber/grafana-sankeyflow-panel/blob/main/SECURITY.md)

SankeyFlow is open source under the
[Apache License 2.0](https://github.com/aviadshiber/grafana-sankeyflow-panel/blob/main/LICENSE).
