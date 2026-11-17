# React

<!-- Owners and paths: the [react] section of review/OWNERS. The owners are the React maintainers on the Next.js team. -->

## Context

- The React maintainers on the team. They review anything that depends on how React works inside, not only on its public API: the vendored React builds, the `react-server` boundary in `entry-base.ts`, and Next.js code anywhere that couples to React internals or the Flight protocol.
- [react-vendoring](react-vendoring.md) covers the mechanics of vendoring: sync tooling, release channels, and runtime bundle variants. This area overlaps it on React's own code and asks a different question: does Next.js still depend only on what React promises?
- What React promises: the exports of `react`, `react-dom`, and `react-server-dom-*` used as documented, and the `status`/`value`/`reason` thenable convention. Everything else, including the Flight wire format, is internal and can change in any sync.

## What failure looks like

- Next.js code that reads Flight bytes or React object internals keeps working until a React sync changes them, then breaks App Router rendering, prefetching, or prerendered payloads already in a CDN. Often in one environment only, and often silently: a wrong answer rather than a throw.
- Example of the pattern: #101440 scans serialized page data for `"$B` to detect Blob references, which depends on React's reference prefixes and string escaping.

## Escalate when

- The diff matches [react-internals-need-human-review](../rules/react-internals-need-human-review.md) (strong, can't be justified). It's a REVIEW.md trigger, not a signal of this area, so it escalates even when the author is one of the owners here.

## Preferences

- When React has no API for what Next.js needs, add one upstream rather than reaching into internals. A temporary coupling links the React issue or PR that will replace it, with a `TODO` at the code site.
