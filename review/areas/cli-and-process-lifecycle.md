# CLI and Process Lifecycle

<!-- Owners and paths: the [cli-and-process-lifecycle] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The `next` binary and command parsing, `next start`, process signal/exit handling, port/host/HTTPS options, dependency checks and SWC binary download, workspace/root detection.
- TODO: key files and the invariants that must hold

## What failure looks like

- `next start` ignores `-p`/`-H`, SIGTERM does not drain in-flight requests, `next dev` leaves orphan workers, wrong project root in monorepos, lockfile patching corrupting installs.
- TODO: past regressions and reverts, with links

## Escalate when

- CLI flag or output changes (strong, public); exit/signal handling changes (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
