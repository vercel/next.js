# Server Security: Internal Header Filtering

## Rule

Next.js strips internal headers from incoming requests via `filterInternalHeaders()` in `lib/server-ipc/utils.ts`. This runs at the entry point in `router-server.ts` before any server code executes. Only headers listed in the `INTERNAL_HEADERS` array are stripped.

**When reviewing PRs: if new code reads a request header that is not a standard HTTP header (like `content-type`, `accept`, `user-agent`, `host`, `authorization`, `cookie`, etc.), flag it for security review.** The header may be forgeable by an external attacker if it is not in the `INTERNAL_HEADERS` filter list.

The `INTERNAL_HEADERS` list is in `lib/server-ipc/utils.ts`. If the header being read is not in that list, it will pass through to server code unfiltered and an attacker can set it to any value.

## Key file

`lib/server-ipc/utils.ts` — `INTERNAL_HEADERS` array and `filterInternalHeaders()` function
