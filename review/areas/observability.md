# Observability

<!-- Owners and paths: the [observability] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- OpenTelemetry spans, `instrumentation.ts`/`instrumentation-client`, request insights, CLI telemetry, build tracing (`.next/trace`), and `onRequestError`.
- TODO: key files and the invariants that must hold

## What failure looks like

- Spans with wrong parent/attributes break customers' dashboards, `instrumentation.register` running twice or not at all, telemetry sending more than documented (privacy), trace files bloating builds.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to span names/attributes or `onRequestError` payload (strong, public contract); new telemetry events (medium).
- TODO

## Rules

- TODO

## Preferences

- TODO
