# Turbo Tasks

<!-- Owners and paths: the [turbo-tasks] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- The incremental computation engine and its persistence layer: task scheduling, invalidation, cells/keyed cells, the backend, on-disk persistence, macros.
- TODO: key files and the invariants that must hold

## What failure looks like

- Stale output after an edit (missed invalidation), deadlocks or livelocks under concurrent tasks, persistent cache that cannot be read by the next version (or is read when it should be rejected), memory growth.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to invalidation, dirty tracking, aggregation, or the persistence format (strong: correctness of every build depends on it); unsafe code or lock-order changes (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
