# Dev-validation benchmark

Measures how much dev-mode **Cache Components validation** contends for the dev
server's event loop during rapid navigation, and how much running it on a worker
thread (`experimental.devValidationWorker`, default on) relieves that.

In `next dev` with Cache Components, every navigation runs a staged validation
render (this covers static-shell validation, which runs on initial load and HMR
refresh, as well as instant-navigation validation when `instant` is configured).
These renders run on the dev server's event loop. When you navigate rapidly (the
canonical "click the same nav item over and over" case), the validation from
earlier navigations piles up and starves the loop, so later requests wait behind
it. This benchmark reproduces that and reports the browser-observed impact.

## Running

```bash
pnpm bench:dev-validation
```

By default it runs an A/B on the same build: validation on a worker thread (the
default) versus in-process (`experimental.devValidationWorker: false`), and
prints the speedup. Options:

- `--worker=true|false` — run a single configuration instead of the A/B.
- `--bundler=turbopack|webpack` — default `turbopack`.
- `--clicks=<n>` — measured navigations per family (default 48).
- `--port=<n>`, `--headless=false`, `--settle-ms=<n>`.
- `--json-out=<path>` — write the raw stats as JSON.

This depends on `experimental.devValidationWorker` existing, so it stacks on the
PR that adds the flag. Until the worker implementation lands, both
configurations run in-process and the A/B shows no delta; once it lands, the
worker column drops.

The fixture's heavy routes are generated (and gitignored); the runner
regenerates them before booting. To generate by hand: `node
scripts/generate.mjs`.

## What it measures

For each route **family** the runner clicks the family's `<Link>` repeatedly.
Navigating to the current route re-renders and re-validates it, so every click
triggers a fresh validation. The routes carry no `instant` config; dev
validation applies to page segments by default at the warning level.

Each family's route is nested several layout segments deep (under a `(routes)`
route group that keeps the URL clean). Validation renders a combined payload at
every URL depth, so a deeper route means more validation renders per navigation.
This mirrors a realistically deep app rather than a single flat segment; a flat
route barely exercises the depth loop. The three families isolate different
per-render costs:

- **client** — the leaf is a large tree of distinct `use client` components.
  Stresses validation's client prerender (`react-dom/static`).
- **server** — the same recursive tree, but server components. Stresses the
  Flight re-encode plus the React owner-stack / `createTask` work validation
  re-processes per depth, which scales with component count.
- **sprite** — one very large SVG server component (many `<symbol>`s), like a
  shared icon sprite, rendered in the family's shared layout so it is part of
  the payload at every depth. Stresses Flight payload size rather than
  component count.

**Primary signal: browser-observed TTFB.** The runner reads Playwright's own
network timing (`request.timing()`) for each navigation and reports TTFB
(`responseStart - requestStart`), the time the browser waits for the server.
That wait includes the event-loop queue time while validation monopolizes the
loop, which is exactly the contention we care about.

The CLI's logged request durations (`GET … in Xms (…, application-code: Yms)`)
are **not** used as the signal. The dev server starts that clock inside the
request handler, after the event loop has already yielded to the request, so the
time a request spends queued behind validation is invisible to it.

## Interpreting results

Running validation on a worker thread frees the event loop between navigations,
so TTFB drops and, more importantly, the long tail (the multi-second stalls
where the loop is fully starved) disappears. The sprite family shows the largest
per-render cost. Absolute numbers vary by machine; run
the A/B on one machine and compare the two columns.
