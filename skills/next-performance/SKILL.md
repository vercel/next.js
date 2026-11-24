---
name: next-performance
description: >
  Slow Next.js app: load as the first step, before measuring anything yourself.
  Use when a route or request is slow or intermittent (including monorepo apps
  the user names without saying Next.js), browser startup or navigation is
  slow, client JavaScript is heavy, or the slow side is unknown.
---

# Next.js performance

Default: diagnose. Edit only on explicit request.

## Route the bottleneck

- **Server request:** For slow or intermittent App Router requests, keep the
  current development server running. Reproduce the affected request, then use
  its local `next experimental-request-insights list` to find the page or API
  request and `get` to inspect it. Pass `--url` if lockfile discovery cannot
  find a custom dev server. The server retains up to 500 completed requests.
  Read the result with **Reading a dev timeline** below.

- **Browser:** For slow startup or navigation, or excess client JavaScript, use
  `next-bundle-optimizer` in audit mode. If unavailable, install it:

  ```bash
  npx skills add vercel/next.js --skill next-bundle-optimizer
  ```

- **Unknown:** Compare server response timing with browser network and
  main-thread timing. Follow the dominant side or report the gap.

Report the measured bottleneck, evidence, and next action.

## Reading a dev timeline

The bundled Request Insights guide explains request kinds and gap attribution.
These dev-server effects distort a single request; weigh them before naming a
bottleneck:

- **Gaps are dev work without spans.** A long gap before `route to render` is
  usually route compilation. On a dynamic route, a gap at the start of
  `BaseServer.renderToResponseWithComponents` is usually static params
  generation, which loads and evaluates the route's modules in a worker. Confirm
  by repeating the request: time that disappears on the warm request was
  compilation or module evaluation.
- **`compile route` spans under the proxy compile the proxy.** Their duration
  says nothing about compiling the page.
- **Concurrent first requests share one compile.** A request that starts while
  another request is compiling the same route waits for it; compare start times
  before blaming the later request.
- **Nested wrappers with the same duration are one interval.** Read the
  innermost span of the chain.
- **Repeated parallel spans overlap.** Measure the batch by its first start and
  last end.

Report compilation, static params generation, and Instant Insights as dev
overhead, separate from the request time a warm or production server would see.
