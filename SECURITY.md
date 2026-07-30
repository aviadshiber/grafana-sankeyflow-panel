# Security policy

## Reporting a vulnerability

Please do not report suspected vulnerabilities in a public issue. Use the private security-reporting channel provided by the hosting forge, or contact the maintainers through the project’s private security contact if one is configured there. Include a clear description, affected version, reproduction steps, impact assessment, and a safe proof of concept where possible.

We will acknowledge a report when practical, investigate privately, and coordinate disclosure and remediation with the reporter. Please allow time for a fix before public disclosure.

## Operational guidance

Do not place secrets in panel JSON, screenshots, examples, issue reports, or logs. Verify plugin artifacts and keep Grafana and SankeyFlow versions pinned in production.

## Upstream development advisories

The release process tracks two upstream dependency constraints that do not ship code inside the
SankeyFlow plugin archive:

- `brace-expansion` ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg))
  is pulled in by lint and test tooling through legacy `minimatch` versions. The patched
  `brace-expansion` major is not API-compatible with those consumers, so the lockfile retains
  `1.1.17` through an explicit development pin until the parent tools migrate. This also prevents
  routine lockfile refreshes from presenting another vulnerable 1.x release as an upgrade.
  SankeyFlow does not pass user-controlled glob expressions to this development-only dependency.
- `react-router` ([GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and
  [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg)) is transitive to
  `@grafana/ui`. Grafana provides `@grafana/ui` at runtime, and webpack externalizes it from the
  plugin archive. SankeyFlow does not use React Router navigation or server-side hydration.

These constraints are reviewed before each release. They must not be allowlisted if a compatible
upstream fix becomes available or if application code begins to exercise an affected path.

## Supported versions

Security fixes are prioritized for the latest release and the currently supported Grafana compatibility tiers. Alpha releases may receive fixes without a backport guarantee.
