## Project knowledge

This repository contains a **Grafana plugin**. You must Read @./.config/AGENTS/instructions.md before doing changes.

## SankeyFlow skill

For dashboard queries, data-shape validation, troubleshooting, contributor
workflow, deployment, or signing guidance, use the bundled
`use-sankeyflow` skill at @./.agents/skills/use-sankeyflow/SKILL.md. Load only
the reference it routes you to, and run its dependency-free fixture validator
before changing panel code to compensate for malformed input.

Treat @./docs/data-model.md and @./src/types.ts as public contracts. Keep option
migrations backward-compatible, preserve the plugin ID, and update contract
documentation and tests together with user-visible behavior.
