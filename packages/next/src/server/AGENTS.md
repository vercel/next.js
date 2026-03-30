# Server Security: Internal Header Filtering

## Rule

Next.js strips internal headers from incoming requests to prevent external attackers from forging them. The filter list is in `lib/server-ipc/utils.ts` in the `INTERNAL_HEADERS` array. The `filterInternalHeaders()` function deletes these headers at the entry point in `router-server.ts` before any server code runs.

**When reviewing PRs that touch server code, flag any new code that reads a header with an internal-looking name that is NOT already in `INTERNAL_HEADERS`.**

Internal-looking header names are those starting with:

- `x-middleware-`
- `x-next-`
- `x-nextjs-`
- `x-now-`
- `x-matched-`
- `x-invocation-`
- `next-` (excluding standard headers like `next-action` used by the client router)

If a PR adds code that reads one of these headers from a request, check the `INTERNAL_HEADERS` array in `lib/server-ipc/utils.ts`. If the header is not in that array, flag it — the header will not be stripped from external requests and an attacker can forge it.

## Current `INTERNAL_HEADERS` list

```
x-middleware-rewrite
x-middleware-redirect
x-middleware-set-cookie
x-middleware-skip
x-middleware-override-headers
x-middleware-next
x-now-route-matches
x-matched-path
x-next-resume-state-length
```

## Example violation

```typescript
// BAD — reads x-next-debug header but it is not in INTERNAL_HEADERS.
// An attacker can set this header on any request.
const debug = req.headers['x-next-debug']
```

## Key file

`lib/server-ipc/utils.ts` — `INTERNAL_HEADERS` array and `filterInternalHeaders()` function
