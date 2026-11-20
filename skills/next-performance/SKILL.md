---
name: next-performance
description: >
  Diagnose Next.js performance. Use for slow or intermittent App Router
  requests, browser startup or navigation, excessive client JavaScript, or an
  unknown server-versus-browser bottleneck.
---

# Next.js performance

Default: diagnose. Edit only on explicit request.

## Route the bottleneck

- **Server request:** For slow or intermittent App Router requests, keep the
  current development server running and run first:

  ```bash
  ./node_modules/.bin/next experimental-request-insights --help
  ```

  Follow it.

- **Browser:** For slow startup or navigation, or excess client JavaScript, use
  `next-bundle-optimizer` in audit mode. If unavailable, install it:

  ```bash
  npx skills add vercel/next.js --skill next-bundle-optimizer
  ```

- **Unknown:** Compare server response timing with browser network and
  main-thread timing. Follow the dominant side or report the gap.

Report the measured bottleneck, evidence, and next action.
