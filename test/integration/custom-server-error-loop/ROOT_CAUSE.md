# Root Cause Analysis: #10024

## The Bug

Custom error page reloads every ~3 seconds in development when rendered
via a custom server (Express, Fastify, etc.).

## Mechanism

```
1. Custom server calls app.render(req, res, '/_error', {})
2. Next.js renders the error page and sends it to the browser
3. Browser loads the page, including the on-demand-entries client
4. on-demand-entries client starts pinging: /_next/webpack-hmr
5. The ping includes the current page path: /_error
6. Dev server receives the ping and checks on-demand-entries
7. /_error is NOT in the on-demand entries map (it's a special page)
8. Server marks the page as "invalid" or unrecognized
9. HMR sends a reload signal to the browser
10. Browser reloads → goes back to step 1
```

## Why It Loops

The on-demand-entries system was designed to track which pages the
developer is actively viewing, so it can compile them on demand and
dispose of unused pages. When a custom server renders `/_error` directly,
the system doesn't recognize it as a valid on-demand entry because:

- `/_error` is a special page, not a regular route
- It's compiled as part of the base build, not on-demand
- The on-demand-entries client doesn't have special handling for it

The fix in #26610 (PR for #8036) partially addressed this for
*directly visiting* `/_error` in the browser by correcting the
statusCode. But it did NOT fix the case where a custom server
explicitly renders the error page via `app.render()` or `app.renderError()`.

## Affected Versions

- Reported: Next.js 9.x (2020)
- Still present: Next.js 15.3.0 (2025), 16.x (2026)
- Only in dev mode (production is fine)

## The Fix

Two options:

### Option A: Exclude error pages from on-demand-entries ping

In the on-demand-entries client, skip the ping for special pages:

```javascript
// packages/next/client/on-demand-entries-client.js (or equivalent)
const SPECIAL_PAGES = ['/_error', '/_app', '/_document', '/404', '/500']

// In the ping function:
if (SPECIAL_PAGES.includes(currentPage)) {
  return // Don't ping for special pages — they're always compiled
}
```

### Option B: Recognize error pages in the on-demand-entries server

In the on-demand-entries handler, return "valid" for special pages
instead of triggering a reload:

```javascript
// packages/next/server/dev/on-demand-entry-handler.js (or equivalent)
if (page === '/_error' || page === '/404' || page === '/500') {
  return { success: true } // Always valid — compiled at build time
}
```

### Recommended: Option B

Option B is safer because it doesn't change client behavior — it just
makes the server recognize error pages as always-valid entries.

## Related Issues

- #8036 — Visiting /_error directly (FIXED in #26610, partial)
- #10024 — Custom server rendering error page (THIS BUG — still open)
- Discussion #40000 — Still reported in Next.js 15.3.0
