---
name: next-performance
description: >
  Diagnose Next.js performance. Use for slow or intermittent App Router
  requests, browser startup or navigation, excessive client JavaScript, or an
  unknown server-versus-browser bottleneck.
---

# Next.js performance

Default: diagnose and propose fixes. Edit only on explicit request.

## Choose the evidence

- **Retained request:** When the user identifies a slow or intermittent App
  Router request, keep the current development server running and run first:

  ```bash
  ./node_modules/.bin/next experimental-request-insights --help
  ```

  Follow it. If Request Insights is disabled, restart the same development
  command with `--experimental-request-insights`, wait until it is ready, and
  reproduce the affected request once. Inspect that request. State that an
  unrecorded original request cannot be recovered.

- **End-to-end flow:** Run the named existing test with its existing command
  and runner. Use development mode when Request Insights is needed. Correlate
  test actions with retained request IDs and browser timing. For Playwright,
  collect its trace, network, and browser timing evidence. For other runners,
  use the artifacts they provide. Temporary instrumentation is allowed; record
  the original state and restore it before reporting.

- **Browser:** For slow startup or navigation, or excess client JavaScript, use
  `next-bundle-optimizer` in audit mode. If unavailable, install it:

  ```bash
  npx skills add vercel/next.js --skill next-bundle-optimizer
  ```

- **Unknown:** Compare server response timing with browser network and
  main-thread timing. Follow the dominant side or report the gap.

Rank measured problems. Report the evidence, proposed fixes, and how each fix
would be verified.
