---
name: router-act
description: >
  How to write end-to-end tests using createRouterAct and LinkAccordion.
  Use when writing or modifying tests that need to control the timing of
  internal Next.js requests (like prefetches) or assert on their responses.
  Covers the act API, fixture patterns, prefetch control via LinkAccordion,
  fake clocks, and avoiding flaky testing patterns.
user-invocable: false
---

# Router Act Testing

Use this skill when writing or modifying tests that involve prefetch requests, client router navigations, or the segment cache. The `createRouterAct` utility from `test/lib/router-act.ts` lets you assert on prefetch and navigation responses in an end-to-end way without coupling to the exact number of requests or the protocol details. This is why most client router-related tests use this pattern.

## When NOT to Use `act`

Don't bother with `act` if you don't need to instrument the network responses — either to control their timing or to assert on what's included in them. If all you're doing is waiting for some part of the UI to appear after a navigation, regular Playwright helpers like `browser.elementById()`, `browser.elementByCss()`, and `browser.waitForElementByCss()` are sufficient.

## Core Principles

1. **Use `LinkAccordion` to control when prefetches happen.** Never let links be visible outside an `act` scope.
2. **Prefer `'no-requests'`** whenever the data should be served from cache. This is the strongest assertion — it proves the cache is working.
3. **Avoid retry/polling timers.** The `act` utility exists specifically to replace inherently flaky patterns like `retry()` loops or `setTimeout` waits for network activity. If you find yourself wanting to poll, you're probably not using `act` correctly.
4. **Avoid the `block` feature.** It's prone to false negatives. Prefer `includes` and `'no-requests'` assertions instead.

## Act API

### Config Options

```typescript
// Assert NO router requests are made (data served from cache).
// Prefer this whenever possible — it's the strongest assertion.
await act(async () => { ... }, 'no-requests')

// Expect at least one response containing this substring
await act(async () => { ... }, { includes: 'Page content' })

// Expect multiple responses (checked in order)
await act(async () => { ... }, [
  { includes: 'First response' },
  { includes: 'Second response' },
])

// Assert the same content appears in two separate responses
await act(async () => { ... }, [
  { includes: 'Repeated content' },
  { includes: 'Repeated content' },
])

// Expect at least one request, don't assert on content
await act(async () => { ... })
```

### How `includes` Matching Works

- The `includes` substring is matched against the HTTP response body. Use text content that appears literally in the rendered output (e.g. `'Dynamic content (stale time 60s)'`).
- Extra responses that don't match any `includes` assertion are silently ignored — you only need to assert on the responses you care about. This keeps tests decoupled from the exact number of requests the router makes.
- Each `includes` expectation claims exactly one response. If the same substring appears in N separate responses, provide N separate `{ includes: '...' }` entries.

### What `act` Does Internally

`act` intercepts all router requests — prefetches, navigations, and Server Actions — made during the scope:

1. Installs a Playwright route handler to intercept router requests
2. Runs your scope function
3. Waits for a `requestIdleCallback` (captures IntersectionObserver-triggered prefetches)
4. Fulfills buffered responses to the browser
5. Repeats steps 3-4 until no more requests arrive
6. Asserts on the responses based on the config

Responses are buffered and only forwarded to the browser after the scope function returns. This means you cannot navigate to a new page and wait for it to render within the same scope — that would deadlock. Trigger the navigation (click the link) and let `act` handle the rest. Read destination page content _after_ `act` returns:

```typescript
await act(
  async () => {
    /* toggle accordion, click link */
  },
  { includes: 'Page content' }
)

// Read content after act returns, not inside the scope
expect(await browser.elementById('my-content').text()).toBe('Page content')
```

## LinkAccordion Pattern

### Why LinkAccordion Exists

`LinkAccordion` controls when `<Link>` components enter the DOM. A Next.js `<Link>` triggers a prefetch when it enters the viewport (via IntersectionObserver). By hiding the Link behind a checkbox toggle, you control exactly when prefetches happen — only when you explicitly toggle the accordion inside an `act` scope.

```tsx
// components/link-accordion.tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href, children, prefetch }) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        `${children} (link is hidden)`
      )}
    </>
  )
}
```

### Standard Navigation Pattern

Always toggle the accordion and click the link inside the same `act` scope:

```typescript
await act(
  async () => {
    // 1. Toggle accordion — Link enters DOM, triggers prefetch
    const toggle = await browser.elementByCss(
      'input[data-link-accordion="/target-page"]'
    )
    await toggle.click()

    // 2. Click the now-visible link — triggers navigation
    const link = await browser.elementByCss('a[href="/target-page"]')
    await link.click()
  },
  { includes: 'Expected page content' }
)
```

## Common Sources of Flakiness

### Using `browser.back()` with open accordions

Do not use `browser.back()` to return to a page where accordions were previously opened. BFCache restores the full React state including `useState` values, so previously-opened Links are immediately visible. This triggers IntersectionObserver callbacks outside any `act` scope — if the cached data is stale, uncontrolled re-prefetches fire and break subsequent `no-requests` assertions.

The only safe use of `browser.back()`/`browser.forward()` is when testing BFCache behavior specifically.

**Fix:** navigate forward to a fresh hub page instead. See [Hub Pages](#hub-pages).

### Using visible `<Link>` components outside `act` scopes

Any `<Link>` visible in the viewport can trigger a prefetch at any time via IntersectionObserver. If this happens outside an `act` scope, the request is uncontrolled and can interfere with subsequent assertions. Always hide links behind `LinkAccordion` and only toggle them inside `act`.

### Using retry/polling timers to wait for network activity

`retry()`, `setTimeout`, or any polling pattern to wait for prefetches or navigations to settle is inherently flaky. `act` deterministically waits for all router requests to complete before returning.

### Navigating and waiting for render in the same `act` scope

Responses are buffered until the scope exits. Clicking a link then reading destination content in the same scope deadlocks. Read page content after `act` returns instead.

## Hub Pages

When you need to navigate away from a page and come back to test staleness, use "hub" pages instead of `browser.back()`. Each hub is a fresh page with its own `LinkAccordion` components that start closed.

Hub pages use `connection()` to ensure they are dynamically rendered. This guarantees that navigating to a hub always produces a router request, which lets `act` properly manage the navigation and wait for the page to fully render before continuing.

**Hub page pattern:**

```tsx
// app/my-test/hub-a/page.tsx
import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../../components/link-accordion'

async function Content() {
  await connection()
  return <div id="hub-a-content">Hub a</div>
}

export default function Page() {
  return (
    <>
      <Suspense fallback="Loading...">
        <Content />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/my-test/target-page">Target page</LinkAccordion>
        </li>
      </ul>
    </>
  )
}
```

**Target pages link to hubs via LinkAccordion too:**

```tsx
// On target pages, add LinkAccordion links to hub pages
<LinkAccordion href="/my-test/hub-a">Hub A</LinkAccordion>
```

**Test flow:**

```typescript
// 1. Navigate to target (first visit)
await act(
  async () => {
    /* toggle accordion, click link */
  },
  { includes: 'Target content' }
)

// 2. Navigate to hub-a (fresh page, all accordions closed)
await act(
  async () => {
    const toggle = await browser.elementByCss(
      'input[data-link-accordion="/my-test/hub-a"]'
    )
    await toggle.click()
    const link = await browser.elementByCss('a[href="/my-test/hub-a"]')
    await link.click()
  },
  { includes: 'Hub a' }
)

// 3. Advance time
await page.clock.setFixedTime(startDate + 60 * 1000)

// 4. Navigate back to target from hub (controlled prefetch)
await act(async () => {
  const toggle = await browser.elementByCss(
    'input[data-link-accordion="/my-test/target-page"]'
  )
  await toggle.click()
  const link = await browser.elementByCss('a[href="/my-test/target-page"]')
  await link.click()
}, 'no-requests') // or { includes: '...' } if data is stale
```

## Fake Clock Setup

Segment cache staleness tests use Playwright's clock API to control `Date.now()`:

```typescript
async function startBrowserWithFakeClock(url: string) {
  let page!: Playwright.Page
  const startDate = Date.now()

  const browser = await next.browser(url, {
    async beforePageLoad(p: Playwright.Page) {
      page = p
      await page.clock.install()
      await page.clock.setFixedTime(startDate)
    },
  })

  const act = createRouterAct(page)
  return { browser, page, act, startDate }
}
```

- `setFixedTime` changes `Date.now()` return value but timers still run in real time
- The segment cache uses `Date.now()` for staleness checks
- Advancing the clock doesn't trigger IntersectionObserver — only viewport changes do
- `setFixedTime` does NOT fire pending `setTimeout`/`setInterval` callbacks

## Diagnosing Hangs (Watchdog)

When an `act` scope hangs, the test would normally fail with Jest's opaque 60-second timeout (`Exceeded timeout of 60000 ms for a test.`) which gives no hint about where the hang happened. `act` ships with an opt-in watchdog that, when enabled, periodically writes a diagnostic to **stderr** describing exactly which phase of `act` is stuck and which RSC fetches (if any) are in flight.

> **The watchdog is off by default.** Enable it for the test run via `ROUTER_ACT_WATCHDOG_MS=<ms>`. Slow CI jobs can have legitimately long phases (e.g. cold compile), so always-on warnings would be noise; the diagnostic is meant to be turned on while actively investigating a flake.

### Sample output

```
[router-act #2] scope blocked for 10000ms (threshold 10000ms)
  phase: wait-fetch-result (stuck 9874ms)
  phase meta: {"url":"http://localhost:43091/prefetch-auto/foobar?_rsc=..."}
  in-flight RSC fetches (1):
    - http://localhost:43091/prefetch-auto/foobar?_rsc=... (9920ms)
  call site:
    at Object.<anonymous> (test/e2e/app-dir/app-prefetch/prefetching.test.ts:312:9)
    ...
```

The output identifies:

- **scope id** (`#2`): in nested `act` calls, this disambiguates which scope is stuck.
- **phase**: which `await` inside `act` is blocked. See [Phase names](#phase-names).
- **phase meta**: phase-specific details (e.g., the URL being fulfilled).
- **in-flight RSC fetches**: requests that have started against the server but not yet returned a response. A long-running fetch here means the server (not Playwright/the client) is the bottleneck.
- **call site**: the test source location that called `act`, so you can map a CI failure back to the exact test scope.

### Phase names

| Phase                             | What it's awaiting                                               |
| --------------------------------- | ---------------------------------------------------------------- |
| `scope`                           | The user-provided async function passed to `act`.                |
| `wait-first-request`              | Up to 500ms for the first router request to be initiated.        |
| `wait-idle-callback-after-scope`  | A `requestIdleCallback` after the scope returns.                 |
| `wait-pending-checks-after-scope` | The async route-handler checks for the requests so far.          |
| `wait-fetch-result`               | The server response for an intercepted request.                  |
| `fulfill-response`                | Playwright fulfilling the intercepted response back to the page. |
| `wait-browser-finished`           | The browser finishing reading the fulfilled response body.       |
| `wait-redirect`                   | A redirect's follow-up request to settle.                        |
| `wait-idle-callback-loop`         | A `requestIdleCallback` between batches of router requests.      |
| `wait-pending-checks-loop`        | Async route-handler checks between batches.                      |
| `cleanup`                         | Removing route handlers / framedetached listener.                |

### Common patterns to look for

- **`phase: scope`, no in-flight fetches**: the hang is inside the user-provided function. The most common cause is calling `link.click()` or `elementByCss()` on something that never becomes actionable (e.g. a detached element). Look at the captured call site to find which `act` call is stuck.
- **`phase: scope`, in-flight fetches > 0 with large elapsed times**: the server isn't responding. Likely the dev server is slow, the page is making a streaming request that never finishes, or a stalled upstream fetch.
- **`phase: wait-fetch-result` or `wait-browser-finished`**: same as above — the server hasn't returned a response, or the browser hasn't drained the response body. Check the URL in `phase meta`.
- **`phase: wait-idle-callback-*`**: rare, but possible if the browser's idle callback queue is jammed. See the `waitForIdleCallback` retry comment in `router-act.ts`.
- **`phase: cleanup`**: `page.unroute()` is hanging — usually only happens when the page context has been torn down externally.

### Configuration

The watchdog is **off by default**. Opt in by setting `ROUTER_ACT_WATCHDOG_MS` to the threshold (in ms) before the first diagnostic is emitted:

```bash
# Enable; diagnostic fires once an `act` phase has been stuck this long.
ROUTER_ACT_WATCHDOG_MS=5000

# (optional) re-emit interval while still stuck. Default 5000 ms.
ROUTER_ACT_WATCHDOG_INTERVAL_MS=2000
```

`ROUTER_ACT_WATCHDOG_MS=0` or unset = disabled (no overhead, no stderr noise). For active flake investigation, a value of `2000`–`5000` is a good starting point — well below Jest's 60s timeout, so you get multiple data points across the hang.

`scripts/repro-flake.mjs` enables the watchdog automatically (defaults to `--watchdog 5000`) so you don't need to set it manually when looping a test for flake reproduction.

### Reading the diagnostic from a CI log

Look for `[router-act #` in the failed-test stderr. There is usually more than one warning emitted before Jest finally times out, which lets you confirm whether the phase stayed stuck the entire time (real deadlock) or rotated through several phases (slow but progressing).

## Reference

- `createRouterAct`: `test/lib/router-act.ts`
- Watchdog unit tests: `test/unit/router-act-watchdog.test.ts`
- `LinkAccordion`: `test/e2e/app-dir/segment-cache/staleness/components/link-accordion.tsx`
- Example tests: `test/e2e/app-dir/segment-cache/staleness/`
