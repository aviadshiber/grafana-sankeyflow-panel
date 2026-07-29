# Governance

SankeyFlow is maintained as an open-source Grafana panel. Decisions are made in the open where practical, with maintainers responsible for project health, releases, security response, and compatibility commitments.

## Roles

- **Maintainers** review and merge changes, steward releases, and resolve project-level decisions.
- **Contributors** propose changes, improve documentation and tests, and participate in review.
- **Users** provide feedback, bug reports, examples, and validation across supported Grafana versions.

Maintainers may delegate release, documentation, or security responsibilities. Current ownership is listed in `CODEOWNERS`.

## Decision process

Routine changes are decided through pull-request review. Changes to the public data contract, compatibility tiers, governance, or security policy should be discussed in an issue or design-focused pull request before implementation. When consensus is not reached, maintainers make the final decision and document the rationale.

## Releases

A release should include tests, a changelog entry, compatibility notes, and a review of signing and catalog requirements. Release artifacts must not contain credentials or private data.
