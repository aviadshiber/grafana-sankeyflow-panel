# Development and testing

## Prerequisites

- Node.js 22 or newer
- npm 11 or newer
- Docker Desktop or Colima for the local Grafana environment

Install dependencies with `npm install`. Useful checks are:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Use `npm run server` to start Grafana locally and `npm run e2e` for browser-level checks when the environment supports them.

## Documentation contract

When behavior changes, update the relevant contract documentation and `CHANGELOG.md` in the same change. New fields should include requiredness, type, aggregation/playback implications, and how invalid values are diagnosed. Keep examples copyable and avoid promising undocumented Grafana APIs.

## Pull requests

Small, focused pull requests are easier to review. Explain the user-visible behavior, compatibility impact, test evidence, and any migration or documentation changes. See [CONTRIBUTING.md](../CONTRIBUTING.md).
