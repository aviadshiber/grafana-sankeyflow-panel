# Deployment

## Local Docker or Colima

The repository includes a Docker Compose development service. With Docker Desktop or Colima running:

```bash
colima start # macOS users who use Colima
npm ci
npm run server
```

The Compose service binds Grafana to `127.0.0.1:3000` and disables anonymous access by
default. If a local-only development session specifically needs anonymous Admin access, opt in
explicitly:

```bash
ANONYMOUS_AUTH_ENABLED=true ANONYMOUS_AUTH_ORG_ROLE=Admin npm run server
```

To pin the Grafana image used by the development environment:

```bash
GRAFANA_VERSION=11.5.2 npm run server
GRAFANA_VERSION=11.6.11 npm run server
```

Use 11.5.2 for compatibility checks and 11.6.11 or newer for the full-support path. Stop the environment with `Ctrl-C`; remove only the project’s Compose resources when cleanup is needed.

## Self-managed Grafana

1. Obtain the signed catalog release artifact and verify its checksum and signature.
2. Extract the plugin into Grafana’s configured plugin directory and retain the attached SBOM with
   the deployment records.
3. Confirm the directory name and plugin ID match the release documentation.
4. Restart Grafana and create a SankeyFlow panel.

Until SankeyFlow reaches beta, self-managed installations must also set
`[plugins] enable_alpha = true` (or `GF_PLUGINS_ENABLE_ALPHA=true`). Enable this only on Grafana
instances where administrators have approved alpha plugins.

Do not allow unsigned plugins or disable signature verification globally as a production deployment shortcut. For air-gapped installations, mirror the approved artifact and its verification material through your normal software-supply-chain process.

## Helm and Kubernetes

SankeyFlow is deployed as a Grafana plugin inside your Grafana workload; it is not a standalone server. With the official Grafana Helm chart or an organization-maintained chart, use the chart’s plugin installation mechanism or an init container to place the signed artifact in the plugin directory. Keep plugin installation, Grafana configuration, and secrets in separate, reviewable values.

A production rollout should:

- pin Grafana and SankeyFlow versions;
- verify the artifact before it enters the image or init container;
- use a read-only plugin filesystem after installation where practical;
- roll out to one canary Grafana before broad deployment;
- preserve panel JSON and query fixtures for rollback verification.

Chart values differ between distributions, so this repository intentionally does not prescribe a vendor-specific Helm values file.

## Community signing and catalog requests

Grafana explicitly permits the first public-plugin submission to be unsigned:
Grafana reviews it before assigning a signature level.

### First submission

Before tagging the first public release, confirm that the `aviadshiber` prefix in
`aviadshiber-sankeyflow-panel` is the slug of the Grafana Cloud organization that will own the
plugin. Create or select that organization first if needed. The plugin ID becomes a public,
immutable identifier after publication; change it before the first submission if the owning
organization uses a different slug.

1. Build and validate the release candidate, including unit, Playwright, accessibility, compatibility-matrix, React compatibility, and plugin-validator checks.
2. Push a version tag. The release workflow verifies the tag is on `main` and matches `package.json`, then creates the packaged ZIP, SHA1, SBOM, and provenance attestation in a draft GitHub release.
3. Publish that GitHub release.
4. Sign in to Grafana's **Plugins Admin** page as an administrator of the Grafana Cloud organization that owns the plugin prefix.
5. Submit the packaged ZIP URL, SHA1, public source-code URL, installation/configuration/testing guidance, and confirm that this repository contains provisioning.
6. Wait for Grafana's automated and manual review. Approval is case-by-case.

### Signing after approval

After Grafana grants the public plugin a signature level:

1. In the matching Grafana Cloud organization, create an Access Policy token in the all-stacks realm with the `plugins:write` scope.
2. Save it as `GRAFANA_ACCESS_POLICY_TOKEN` in the protected GitHub Actions `release-signing` environment, with required reviewers configured.
3. Push the release tag (or rerun the release workflow) so `grafana/plugin-actions/build-plugin` signs and packages the artifact. The token is not present in PR/CI jobs and is exposed only by the action’s signing step.
4. Confirm the ZIP contains `MANIFEST.txt`, verify the attached `sbom.cdx.json`, publish the release, and provide the release URL through Plugins Admin for subsequent updates.

Never commit the token, print it in logs, or put it in `jsonData`. A successful build or GitHub release does not imply Grafana approval. Current primary references are Grafana's [publishing guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/), [submission guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin/), and [signing guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin).
