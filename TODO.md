# SankeyFlow release TODO

This checklist tracks the work remaining after the initial open-source implementation.
Do not publish the first Grafana catalog release until the plugin owner and immutable plugin ID
have been confirmed.

## Repository protection

- [x] Protect the default `main` branch.
- [x] Require every change to `main` to arrive through a pull request.
- [x] Apply the pull-request and status-check rules to administrators.
- [x] Restrict updates to the `aviadshiber` owner account through pull requests only.
- [x] Block force pushes and branch deletion.
- [x] Require branches to be current with `main` before merging.
- [x] Require build, dependency review, bundle, compatibility, and the complete Grafana
  Playwright matrix to pass.
- [x] Require pull-request conversations to be resolved.
- [ ] Update the required-check names whenever the Grafana compatibility matrix changes.

## Confirm ownership before `v0.1.0`

- [ ] Create or select the Grafana Cloud organization that will own the plugin.
- [ ] Confirm that its slug is exactly `aviadshiber`.
- [ ] If the organization uses another slug, rename
  `aviadshiber-sankeyflow-panel` everywhere before the first catalog submission.
- [ ] Re-run the Grafana plugin validator and confirm the unregistered-account warning is gone.

The published plugin ID is a public identifier and should be treated as immutable.

## First public submission

- [ ] Review and merge only dependency updates that pass the protected branch gate.
- [x] Resolve or document the upstream transitive Dependabot advisories:
  `brace-expansion` from development tooling and `react-router` from `@grafana/ui`.
- [ ] Confirm `package.json`, `CHANGELOG.md`, and release notes all describe version `0.1.0`.
- [ ] Run the complete release-candidate suite:
  - [ ] dependency lockfile and public-registry verification;
  - [ ] typecheck and lint;
  - [ ] unit and agent-skill fixture tests;
  - [ ] production build and React compatibility scan;
  - [ ] Playwright tests for every supported Grafana version;
  - [ ] accessibility scan;
  - [ ] CycloneDX SBOM generation;
  - [ ] Grafana plugin validator.
- [ ] Tag the protected `main` commit as `v0.1.0`.
- [ ] Approve the `release-signing` environment deployment.
- [ ] Inspect the generated draft GitHub release, plugin ZIP, checksum, SBOM, and provenance
  attestation.
- [ ] Publish the initial unsigned GitHub release.
- [ ] Submit the release through Grafana Plugins Admin with:
  - [ ] plugin ZIP URL and checksum;
  - [ ] public source repository;
  - [ ] installation and configuration guidance;
  - [ ] testing and provisioning instructions;
  - [ ] screenshots and support links.
- [ ] Wait for Grafana's automated and manual catalog review.

Grafana expects a new public plugin's first submission to be unsigned. A successful GitHub release
does not imply catalog approval.

## Signing after Grafana approval

- [ ] Record the signature level granted by Grafana.
- [ ] Create an all-stacks Grafana Cloud access-policy token with only `plugins:write`.
- [ ] Store it as the `GRAFANA_ACCESS_POLICY_TOKEN` secret in the protected
  `release-signing` environment.
- [ ] Re-run the release workflow for the approved release.
- [ ] Confirm the signed ZIP contains `MANIFEST.txt`.
- [ ] Verify the checksum, SBOM, and provenance attestation before publishing.
- [ ] Submit the signed release URL through Plugins Admin.
- [ ] Rotate or revoke the signing token according to the maintainer security policy.

Never commit the signing token, place it in panel configuration, or print it in workflow logs.

## Production deployment

- [ ] Install only the signed catalog artifact in production Grafana instances.
- [ ] Pin the Grafana and SankeyFlow versions.
- [ ] Retain the checksum, signature, SBOM, and approval evidence with deployment records.
- [ ] Enable alpha plugins explicitly while SankeyFlow remains in the alpha state.
- [ ] Deploy to a canary Grafana instance first.
- [ ] Verify representative edge, path, cycle, time-playback, empty-state, and
  high-cardinality dashboards.
- [ ] Roll out broadly only after canary verification.
- [ ] Preserve the previous plugin artifact and dashboard fixtures for rollback.

## OSS launch follow-up

- [ ] Sign in to [OpenSSF Best Practices project 13928](https://www.bestpractices.dev/projects/13928)
      with the `aviadshiber` GitHub account, complete only verifiable claims, and add the badge after
      it reaches passing status.
- [ ] Re-run OpenSSF Scorecard after 2026-10-27, when the repository becomes old enough for the
      `Maintained` check to evaluate normal activity.
- [ ] Add an independent trusted reviewer before requiring one approval and CODEOWNER review; do
      not deadlock owner-authored pull requests while `@aviadshiber` is the sole maintainer.
- [ ] Reassess the generated `.config/Dockerfile` image pin when Grafana plugin tools updates its
      managed template.
- [ ] Triage the initial Dependabot pull requests and close superseded updates.
- [ ] Add a sponsorship link to `plugin.json` if project funding is enabled.
- [ ] Publish the roadmap and label suitable first issues.
- [ ] Add the Grafana catalog URL to the repository after approval.
- [ ] Announce the first release and invite accessibility, datasource, and scale feedback.

## Primary references

- [Publish a Grafana plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin/)
- [Sign a Grafana plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
- [Automate plugin builds](https://grafana.com/developers/plugin-tools/publish-a-plugin/build-automation)
- [Run plugin end-to-end tests in CI](https://grafana.com/developers/plugin-tools/e2e-test-a-plugin/ci)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
