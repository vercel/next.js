# Server Security: Internal Header Trust Boundaries

## Trust Model

Next.js server code has two trust boundaries for internal headers:

1. **`filterInternalHeaders()`** in `lib/server-ipc/utils.ts` — strips known internal headers from incoming requests at the `router-server.ts` entry point (line 210). Headers in the `INTERNAL_HEADERS` list are deleted before any routing or rendering logic runs.

2. **`minimalMode`** — a boolean flag indicating the server is running behind a trusted platform layer (e.g., Vercel's adapter/CDN). Code gated by `minimalMode` can trust internal headers because the platform controls the request before it reaches Next.js.

External requests that bypass a trusted platform can forge any header. Code that reads internal headers **must** be protected by at least one of these mechanisms.

## Internal Headers

These headers are set by the platform or internal middleware and must never be trusted from external requests:

| Header                          | Filtered by `INTERNAL_HEADERS`? | Must be gated by `minimalMode`? |
| ------------------------------- | ------------------------------- | ------------------------------- |
| `x-matched-path`                | Yes                             | Yes (authoritative page path)   |
| `x-now-route-matches`           | Yes                             | Yes (dynamic route params)      |
| `x-middleware-rewrite`          | Yes                             | No (filtered before use)        |
| `x-middleware-redirect`         | Yes                             | No (filtered before use)        |
| `x-middleware-set-cookie`       | Yes                             | No (filtered before use)        |
| `x-middleware-skip`             | Yes                             | No (filtered before use)        |
| `x-middleware-override-headers` | Yes                             | No (filtered before use)        |
| `x-middleware-next`             | Yes                             | No (filtered before use)        |
| `x-next-resume-state-length`    | Yes                             | Yes (PPR postponed state size)  |
| `next-resume`                   | **No**                          | **Yes** (PPR resume trigger)    |
| `x-nextjs-data`                 | **No**                          | Needs review                    |
| `x-invocation-id`               | **No**                          | Needs review                    |

## Review Rules

When reviewing changes under `packages/next/src/server/`, flag the following:

### 1. New reads of internal headers without protection

Any code that reads a header from the table above must either:

- Be reached only after `filterInternalHeaders()` has stripped it (i.e., the header is in `INTERNAL_HEADERS`), **or**
- Be explicitly gated by `this.minimalMode`, `isMinimalMode`, or equivalent check

Flag if neither condition is met.

```typescript
// BAD — trusts header from external request without gate
if (req.headers['next-resume'] === '1' && req.method === 'POST') {
  const body = await readBody(req)
  // ...
}

// GOOD — gated by minimalMode
if (
  this.minimalMode &&
  req.headers['next-resume'] === '1' &&
  req.method === 'POST'
) {
  const body = await readBody(req)
  // ...
}
```

### 2. New internal headers not added to the filter list

If a PR introduces a new header that is set by the platform or internal middleware, it **must** be added to `INTERNAL_HEADERS` in `lib/server-ipc/utils.ts` unless it is always gated by `minimalMode` at every read site.

### 3. Removing headers from `INTERNAL_HEADERS`

Removing a header from the filter list or weakening `filterInternalHeaders()` expands the attack surface. Flag for explicit security review.

### 4. Moving gated code to ungated paths

If code that previously ran only inside a `minimalMode` block is moved to run unconditionally (e.g., to support adapters), verify that any internal header reads in that code path are still protected. This is the pattern that caused the `next-resume` and middleware bypass vulnerabilities.

## Key Files

- `lib/server-ipc/utils.ts` — `INTERNAL_HEADERS` list and `filterInternalHeaders()`
- `lib/router-server.ts:210` — where `filterInternalHeaders()` is called
- `base-server.ts` — `minimalMode` gating for `x-matched-path`, `next-resume`
- `../build/templates/app-page.ts` — route handler template (reads `next-resume`)
