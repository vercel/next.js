# Test Infra

<!-- Owners and paths: the [test-infra] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The shared e2e harness and runner: `nextTestSetup`, next-modes (dev/start/deploy), webdriver, gate/condition system, router-act, the test runner and sharding, Jest config, deploy-test manifests, and the stats app used for size tracking.
- TODO: key files and the invariants that must hold

## What failure looks like

- A harness change that makes a class of tests pass vacuously (no-fake-greens at scale), flaky browser setup, deploy mode diverging from start mode, sharding dropping suites.
- TODO: past regressions and reverts, with links

## Escalate when

- REVIEW.md's `shared-test-infra` rule already makes `test/lib/**` medium. Add: changes to `gate/` condition evaluation or `next-modes/base.ts` (medium); changes to `run-tests.js` filtering/manifest logic (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
