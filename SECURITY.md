# Security policy

## Reporting a vulnerability

Please do not report suspected vulnerabilities in a public issue. Use the private security-reporting channel provided by the hosting forge, or contact the maintainers through the project’s private security contact if one is configured there. Include a clear description, affected version, reproduction steps, impact assessment, and a safe proof of concept where possible.

We will acknowledge a report when practical, investigate privately, and coordinate disclosure and remediation with the reporter. Please allow time for a fix before public disclosure.

## Operational guidance

Do not place secrets in panel JSON, screenshots, examples, issue reports, or logs. Verify plugin artifacts and keep Grafana and SankeyFlow versions pinned in production.

## Upstream development advisories

The release process keeps the following narrowly scoped, time-bounded exceptions in
`osv-scanner.toml`. They must be reviewed before each release and removed as soon as a compatible
upstream update is available or the panel begins to exercise an affected path:

- `brace-expansion` ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg))
  is reached only through legacy `minimatch` consumers in lint and test tooling. The patched major
  is outside those consumers' declared API range. This dependency tree is not bundled into the
  plugin, and panel code does not accept user-controlled glob expressions.
- `react-router` ([GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and
  [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg)) is transitive to
  `@grafana/ui`. Webpack externalizes React Router and Grafana provides it at runtime; SankeyFlow
  does not import it, use navigation, or use server-side hydration.

The UUID advisory [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) is
remediated through `@grafana/react-detect` 0.7.2 and a scoped `uuid` 11.1.1 override for its
`snyk-nodejs-lockfile-parser` dependency. That parser uses only the retained `uuid.v4` API; the
`react:detect` check verifies the compatible resolved graph.

## Supported versions

Security fixes are prioritized for the latest release and the currently supported Grafana compatibility tiers. Alpha releases may receive fixes without a backport guarantee.
