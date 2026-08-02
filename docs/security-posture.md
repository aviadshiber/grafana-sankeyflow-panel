# Security posture and accepted limitations

This document records the context behind automated security results that cannot be completely
resolved by a repository change. It is a point-in-time assessment, not a warranty that every
security issue has been identified. Reassess these decisions before each public release and when
the maintainer model or Grafana plugin-tooling template changes.

Last reviewed: 2026-08-02

## Repository controls

- `main` accepts changes only through pull requests and applies the gate to administrators.
- Force pushes and branch deletion are disabled.
- Required CI, dependency review, compatibility, bundle, and Playwright checks must pass.
- Pull-request conversations must be resolved before merge.
- `@aviadshiber` is the sole owner and CODEOWNER and is the only account allowed to merge.
- GitHub Actions are pinned to immutable commit SHAs, Dependabot is enabled, and CodeQL,
  dependency review, OpenSSF Scorecard, SBOM generation, and release provenance checks run in CI.

## OpenSSF Scorecard context

| Check               | Status and rationale                                                                                                                                                                                                                                                                                                                                                  | Revisit trigger                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Branch Protection   | The repository enforces pull requests, required checks, conversation resolution, administrator enforcement, and immutable history. The public repository ruleset makes the pull-request requirement visible to Scorecard.                                                                                                                                             | Any ownership, required-check, or ruleset change.                                                |
| Code Review         | Accepted single-maintainer limitation. Requiring an independent approval would prevent the sole owner from merging owner-authored changes. Automated CI and security checks remain mandatory, but they are not represented as human review.                                                                                                                           | Add one independent trusted reviewer before requiring an approval and CODEOWNER review.          |
| Maintained          | Time-bound signal, not a repository defect. OpenSSF does not score repositories until they are more than 90 days old; this repository was created on 2026-07-29.                                                                                                                                                                                                      | Re-run after 2026-10-27; the first unambiguous eligible date is 2026-10-28.                      |
| Pinned Dependencies | Accepted development-harness limitation. `.config/Dockerfile` is generated and managed by Grafana plugin tools and defaults to a mutable Grafana development image. Repository policy forbids local edits under `.config`; production plugin artifacts do not contain or deploy that image. Developers can select an explicit Grafana version with `GRAFANA_VERSION`. | Grafana updates the managed template, or the image becomes part of a release or production path. |
| CII Best Practices  | [OpenSSF Best Practices project 13928](https://www.bestpractices.dev/projects/13928) is registered and in progress. Its owner-authenticated questionnaire is not yet complete. Do not display a passing badge until the public assessment supports that claim.                                                                                                              | Complete and publish the authenticated application at `bestpractices.dev`.                       |

Maintainer annotations are stored in [`.github/scorecard.yml`](../.github/scorecard.yml). They add
context to Scorecard output; they do not change the underlying score or conceal accepted risk.
