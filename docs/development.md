# Development and testing

## Prerequisites

- Node.js 22 or newer
- npm 11 or newer
- Docker Desktop or Colima with Docker Compose 2.24.4 or newer for the local Grafana environment

Install dependencies with `npm ci`; the repository `.npmrc` enforces the public HTTPS npm
registry and CI rejects lockfile URLs that are plaintext or point at a private host. Useful
checks are:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Use `npm run server` to start Grafana locally and `npm run e2e` for browser-level checks. Grafana
is bound to loopback and anonymous access is disabled by default. The development Compose override
enables alpha plugins because SankeyFlow's metadata intentionally reports its current lifecycle
state. To explicitly opt into an anonymous Admin session, use:

```bash
ANONYMOUS_AUTH_ENABLED=true ANONYMOUS_AUTH_ORG_ROLE=Admin npm run server
```

## Documentation contract

When behavior changes, update the relevant contract documentation and `CHANGELOG.md` in the same change. New fields should include requiredness, type, aggregation/playback implications, and how invalid values are diagnosed. Keep examples copyable and avoid promising undocumented Grafana APIs.

## Pull requests

Small, focused pull requests are easier to review. Explain the user-visible behavior, compatibility impact, test evidence, and any migration or documentation changes. See [CONTRIBUTING.md](../CONTRIBUTING.md).
