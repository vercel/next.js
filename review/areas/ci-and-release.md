# CI and Release

<!-- Owners and paths: the [ci-and-release] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- GitHub workflows and actions, the release/publish scripts, PR tooling (`pr-status`, adopt-pr, auto-label), repo-level package manager config.
- TODO: key files and the invariants that must hold

## What failure looks like

- A release published from the wrong branch or with a wrong version, broken canary auto-sync, test matrix silently shrinking.
- TODO: past regressions and reverts, with links

## Escalate when

- Already strong in REVIEW.md (CI, release scripts). Add: new `pull_request_target`/`workflow_run` triggers or unpinned third-party actions (strong, see `.github/AGENTS.md`); test-matrix/sharding changes in `build_and_test.yml` (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
