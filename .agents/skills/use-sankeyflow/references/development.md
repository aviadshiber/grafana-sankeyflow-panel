# Contributor workflow

Work from the plugin root and preserve unrelated changes.

1. Create a minimal edge or path fixture and run the dependency-free validator.
2. Update the model, parser, renderer, or options with the smallest compatible change.
3. Add focused unit coverage for valid data, diagnostics, aggregation, limits, and time behavior when applicable.
4. Run `npm run typecheck` and `npm run test:ci`.
5. Run `npm run lint` and `npm run build` for changes that affect source, packaging, or webpack output.
6. Run the relevant Playwright checks when panel behavior or accessibility changes.

Use the existing `.config/` webpack configuration. Do not import an unbuilt plugin bundle from the fixture validator. Keep public option defaults and `schemaVersion` compatible; document migrations when they cannot remain compatible.

For Grafana API questions, consult the official plugin documentation named by the repository instructions. Do not modify `.config/` or change the plugin ID/type as incidental work.
