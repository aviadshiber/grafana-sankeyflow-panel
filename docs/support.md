# Support

## Before opening an issue

Check the compatibility tier, validate the query’s data frame, and compare the panel configuration with the [data model](data-model.md). For playback issues, include timestamps and bucket size. For layout issues, include node/link counts and whether circular links are enabled.

## What to include

- SankeyFlow version and Grafana version
- Browser and operating system
- Installation method (local, self-managed, container, or Helm)
- Sanitized panel JSON and a minimal representative data frame
- Exact steps, expected result, actual result, and diagnostics shown by the panel
- A screenshot or recording when the issue is visual or interactive

Remove credentials, tokens, customer data, and sensitive URLs before sharing. If the issue could expose a vulnerability, follow [SECURITY.md](../SECURITY.md) instead of filing a public issue.

## Support boundary

Community support covers reproducible plugin behavior, documentation, and contribution guidance. Grafana hosting, data-source availability, Kubernetes infrastructure, and third-party catalog review remain the responsibility of the relevant provider or operator.
