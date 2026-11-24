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

- **Browser:** For slow startup or navigation, or excess client JavaScript, use
  `next-bundle-optimizer` in audit mode. If unavailable, install it:

  ```bash
  npx skills add vercel/next.js --skill next-bundle-optimizer
  ```

- **Unknown:** Compare server response timing with browser network and
  main-thread timing. Follow the dominant side or report the gap.

Report the measured bottleneck, evidence, and next action.
