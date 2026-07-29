# Changelog

All notable changes to SankeyFlow are recorded here. Entries describe the public OSS contract and user-visible behavior.

## Unreleased

### Added

- Typed edge, path, and automatic input modes with configurable field mappings and aggregation.
- Circular Sankey layout, directional and alignment controls, deterministic sorting, and graph limits.
- SVG and hybrid Canvas/SVG renderers with responsive labels, search, keyboard selection, path highlighting, and copyable details.
- Time-bucketed playback with speed, seek, loop, and reduced-motion behavior.
- Diagnostics, high-contrast patterns, and an accessible tabular representation of every rendered link.
- Versioned panel options and idempotent migrations for legacy option aliases.
- Unit, migration, accessibility, and provisioned Grafana Playwright coverage.
- A bundled agent skill under `.agents/skills/use-sankeyflow` for query authors, dashboard agents, and troubleshooters.
- Build, release, SBOM, dependency-review, CodeQL, and OpenSSF Scorecard automation.
- OSS documentation for schemas, deployment, architecture, support, signing, governance, and contribution.
- Compatibility guidance for Grafana 11.5.2 and full support guidance for Grafana 11.6.11 and later.

### Security

- Bounded frame, row, field, provenance, diagnostic, node, link, playback, canvas, and hybrid-overlay work for untrusted query results.
- Restricted clipboard output to an explicit normalized selection contract.
- Isolated release signing from pull-request CI, pinned workflow actions, attached release SBOMs, and enforced public HTTPS dependency URLs.
- Bound the local Grafana development service to loopback with anonymous access disabled by default.

### Status

- SankeyFlow remains alpha. The documented contract is the baseline for compatibility, while undocumented implementation details may change.
