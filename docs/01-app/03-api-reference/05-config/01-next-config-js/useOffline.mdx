---
title: useOffline
description: Learn how to enable the experimental `useOffline` configuration option to detect connectivity and retry failed requests automatically.
version: experimental
related:
  links:
    - app/api-reference/functions/use-offline
    - app/guides/progressive-web-apps
---

The `useOffline` configuration option enables offline connectivity detection and automatic retry of failed navigation, prefetch, and Server Action requests. When enabled, it also exposes the [`useOffline`](/docs/app/api-reference/functions/use-offline) hook for reading the current offline state from Client Components.

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
module.exports = {
  experimental: {
    useOffline: true,
  },
}
```

When enabled, Next.js will:

- Listen for the browser's [`offline`](https://developer.mozilla.org/en-US/docs/Web/API/Window/offline_event) and [`online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) events to track connectivity.
- Detect network failures on navigation, prefetch, and Server Action requests.
- Poll for connectivity using [`HEAD`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/HEAD) requests with backoff while offline.
- Automatically retry blocked requests once connectivity is restored.
- Make the [`useOffline`](/docs/app/api-reference/functions/use-offline) hook available from `next/offline`.

## How retry works

The offline state is entered through one of two paths:

- **Browser event.** Next.js registers a `window.addEventListener('offline', ...)` listener. When the OS reports the network interface as down, the offline state flips on immediately.
- **Failed fetch.** Any navigation, prefetch, or Server Action request whose `fetch()` rejects with a non-abort, non-timeout error calls into the offline module. This catches the case where the browser still reports `navigator.onLine === true` but the actual request cannot reach the origin (captive portal, broken DNS, dead upstream).

Once in the offline state, a polling loop tries to confirm that connectivity has returned.

### The connectivity check

Each check issues a single `HEAD` request to the current page's URL with the RSC header set, the same endpoint navigations use. The request is aborted after 200 ms.

Two outcomes count as "online":

1. The fetch resolves normally.
2. The 200 ms timeout aborts the request. A truly offline request fails almost instantly (DNS or TCP error), so if it's still pending at 200 ms the TCP handshake succeeded and the server is reachable.

Any other rejection schedules the next check. A successful framework fetch (navigation, prefetch, Server Action) during the offline period also flips the state back to online.

### Backoff

Delays between checks are stepped, not exponential, and capped at 3 seconds:

| Attempt     | Delay before next check |
| ----------- | ----------------------- |
| 1           | 500 ms                  |
| 2           | 1 s                     |
| 3           | 2 s                     |
| 4 and after | 3 s                     |

The browser's `online` event short-circuits the current wait and runs a connectivity check immediately. Reconnection is detected without waiting for the next scheduled tick.

### Giving up

The polling loop never gives up on its own. It continues at the 3-second cap until a check succeeds or the page unloads. A device that goes offline for hours and then regains connectivity will have its polling loop resume and resolve normally.

### Retry of framework requests

While the offline state is active, any navigation, prefetch, or Server Action waits for the next connectivity check to succeed, whether it was newly issued or already in flight when the connection dropped. When the check succeeds, the request runs once; no extra backoff applies.

If it fails with a network error, the app re-enters the offline state and the polling loop starts again.

### Traffic at reconnection

A single client does not produce a runaway burst of traffic against its origin:

- While the client is offline, a failed `fetch()` rejects locally at the browser's network layer. The request never reaches the origin.
- The polling loop issues one `HEAD` request at a time, with delays capped at 3 seconds. No other framework requests are sent to the origin during the offline period.
- When connectivity returns, each pending navigation and Server Action fires once. Only the last navigation attempt is kept pending, and a typical form button is disabled while its action is pending.
- Prefetches run through the [existing prefetch queue](/docs/app/guides/prefetching#prefetch-scheduling), not all at once.

In practice, this feature is unlikely to flood your server. The only extra traffic it generates per offline user is the HEAD polling, which stops as soon as connectivity returns. Prefetches, Server Actions, and navigations fire the same number of times they would have without an outage, just delayed.

## Version History

| Version   | Changes                                                    |
| --------- | ---------------------------------------------------------- |
| `v16.x.0` | `experimental.useOffline` configuration option introduced. |
