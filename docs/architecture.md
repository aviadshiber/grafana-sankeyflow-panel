# Architecture

SankeyFlow follows a small, testable pipeline:

```text
Grafana data frames
        ↓
field mapping and mode detection
        ↓
normalization, aggregation, provenance, diagnostics
        ↓
graph model (nodes, links, totals, cycles)
        ↓
layout (including circular links)
        ↓
renderer and interaction layer
```

## Boundaries

The parser owns schema validation, edge/path conversion, aggregation, time bucketing, and diagnostics. The graph model is the stable boundary between data interpretation and presentation. Layout consumes that model without reaching back into Grafana data frames.

The renderer owns SVG/hybrid presentation, labels, values, percentages, colors, patterns, and motion. Interaction owns search, selection, path highlighting, copy, and accessible table output. Grafana remains the owner of queries, variables, dashboard state, and plugin lifecycle.

## Performance model

The panel is designed for bounded dashboard work. Node, link, and frame limits protect the browser from unexpectedly large results. Automatic rendering may choose a lighter or hybrid path as link counts grow; explicit renderer settings are available for predictable deployments.

The model retains provenance without requiring the renderer to retain the original data frame shape. This makes diagnostics and tooltips explainable while keeping layout inputs compact.

## Compatibility approach

SankeyFlow targets Grafana 11.6.11 and later for full support. Grafana 11.5.2 is maintained as a compatibility tier because it is the minimum supported dependency. Compatibility-tier issues should include the exact Grafana version, plugin version, data-frame shape, panel JSON, and browser.
