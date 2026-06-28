---
title: instrumentation-client.js
description: Learn how to add client-side instrumentation to track and monitor your Next.js application's frontend performance.
---

The `instrumentation-client.js|ts` file allows you to add monitoring, analytics code, and other side-effects that run before your application becomes interactive. This is useful for setting up performance tracking, error monitoring, polyfills, or any other client-side observability tools.

To use it, place the file in the **root** of your application or inside a `src` folder.

## Usage

Unlike [server-side instrumentation](/docs/app/guides/instrumentation), you do not need to export any specific functions. You can write your monitoring code directly in the file:

```ts filename="instrumentation-client.ts" switcher
// Set up performance monitoring
performance.mark('app-init')

// Initialize analytics
console.log('Analytics initialized')

// Set up error tracking
window.addEventListener('error', (event) => {
  // Send to your error tracking service
  reportError(event.error)
})
```

```js filename="instrumentation-client.js" switcher
// Set up performance monitoring
performance.mark('app-init')

// Initialize analytics
console.log('Analytics initialized')

// Set up error tracking
window.addEventListener('error', (event) => {
  // Send to your error tracking service
  reportError(event.error)
})
```

**Error handling:** Implement try-catch blocks around your instrumentation code to ensure robust monitoring. This prevents individual tracking failures from affecting other instrumentation features.

## Router navigation tracking

You can export `onRouterTransitionStart` to observe the start of App Router navigations:

```ts filename="instrumentation-client.ts"
export function onRouterTransitionStart(
  url: string,
  navigationType: 'push' | 'replace' | 'traverse'
) {
  console.log(url, navigationType)
}
```

Additional router transition information is experimental. Enable it to receive a third `event` argument:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    instrumentationClientRouterTransitionEvents: true,
  },
}

export default nextConfig
```

The event includes the transition metadata and source context known when the navigation is dispatched:

```ts filename="instrumentation-client.ts" switcher
import type { RouterTransitionStartEvent, RouterTransitionType } from 'next'

export function onRouterTransitionStart(
  url: string,
  navigationType: RouterTransitionType,
  { id, timestamp, fromRoutes, prefetchIntent }: RouterTransitionStartEvent
) {
  console.log(id, timestamp, url, navigationType, fromRoutes, prefetchIntent)
}
```

```js filename="instrumentation-client.js" switcher
export function onRouterTransitionStart(url, navigationType, event) {
  console.log(
    event.id,
    event.timestamp,
    url,
    navigationType,
    event.fromRoutes,
    event.prefetchIntent
  )
}
```

`onRouterTransitionStart` receives:

- `url: string` - The URL being navigated to
- `navigationType: 'push' | 'replace' | 'traverse'` - The type of navigation
- `event.id` - An opaque ID shared by events for this transition
- `event.timestamp` - A framework-captured Unix timestamp in milliseconds
- `event.fromRoutes` - Route patterns visible before navigation. The primary `children` route is first, followed by parallel slots in deterministic order
- `event.prefetchIntent` - For link navigations, whether the clicked link requested full prefetching (`full`), used automatic prefetching (`auto`), or did not request prefetching (`none`). For navigations with no associated link (programmatic `router.push()`/`router.replace()`, or browser back/forward) this is `null`, since no link prefetch intent applies

Route entries use filesystem-style patterns, so a navigation away from `/blog/hello` may report `/blog/[slug]`.

Hook errors are isolated and do not affect navigation or other hooks.

## Performance considerations

Keep instrumentation code lightweight.

Next.js monitors initialization time in development and will log warnings if it takes longer than 16ms, which could impact smooth page loading.

## Execution timing

The `instrumentation-client.js` file executes at a specific point in the application lifecycle:

1. **After** the HTML document is loaded
2. **Before** React hydration begins
3. **Before** user interactions are possible

This timing makes it ideal for setting up error tracking, analytics, and performance monitoring that needs to capture early application lifecycle events.

## See also

`next.config.js` plugins (for example, wrappers like `withSentry`) can register their own client instrumentation module via the [`instrumentationClientInject`](/docs/app/api-reference/config/next-config-js/instrumentationClientInject) option. Injected modules run before this file, in array order, and may export the same router transition start hook. Application code should continue to use this file convention directly.

## Examples

### Error tracking

Initialize error tracking before React starts and add navigation breadcrumbs for better debugging context.

```ts filename="instrumentation-client.ts" switcher
import Monitor from './lib/monitoring'

Monitor.initialize()

export function onRouterTransitionStart(url: string) {
  Monitor.pushEvent({
    message: `Navigation to ${url}`,
    category: 'navigation',
  })
}
```

```js filename="instrumentation-client.js" switcher
import Monitor from './lib/monitoring'

Monitor.initialize()

export function onRouterTransitionStart(url) {
  Monitor.pushEvent({
    message: `Navigation to ${url}`,
    category: 'navigation',
  })
}
```

### Analytics tracking

Initialize analytics and track navigation events with detailed metadata for user behavior analysis.

```ts filename="instrumentation-client.ts" switcher
import { analytics } from './lib/analytics'

analytics.init()

export function onRouterTransitionStart(url: string, navigationType: string) {
  analytics.track('page_navigation', {
    url,
    type: navigationType,
    timestamp: Date.now(),
  })
}
```

```js filename="instrumentation-client.js" switcher
import { analytics } from './lib/analytics'

analytics.init()

export function onRouterTransitionStart(url, navigationType) {
  analytics.track('page_navigation', {
    url,
    type: navigationType,
    timestamp: Date.now(),
  })
}
```

### Performance monitoring

Track Time to Interactive and navigation performance using the Performance Observer API and performance marks.

```ts filename="instrumentation-client.ts" switcher
const startTime = performance.now()

const observer = new PerformanceObserver(
  (list: PerformanceObserverEntryList) => {
    for (const entry of list.getEntries()) {
      if (entry instanceof PerformanceNavigationTiming) {
        console.log('Time to Interactive:', entry.loadEventEnd - startTime)
      }
    }
  }
)

observer.observe({ entryTypes: ['navigation'] })

export function onRouterTransitionStart(url: string) {
  performance.mark(`nav-start-${url}`)
}
```

```js filename="instrumentation-client.js" switcher
const startTime = performance.now()

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry instanceof PerformanceNavigationTiming) {
      console.log('Time to Interactive:', entry.loadEventEnd - startTime)
    }
  }
})

observer.observe({ entryTypes: ['navigation'] })

export function onRouterTransitionStart(url) {
  performance.mark(`nav-start-${url}`)
}
```

### Polyfills

Load polyfills before application code runs. Use static imports for immediate loading and dynamic imports for conditional loading based on feature detection.

```ts filename="instrumentation-client.ts" switcher
import './lib/polyfills'

if (!window.ResizeObserver) {
  import('./lib/polyfills/resize-observer').then((mod) => {
    window.ResizeObserver = mod.default
  })
}
```

```js filename="instrumentation-client.js" switcher
import './lib/polyfills'

if (!window.ResizeObserver) {
  import('./lib/polyfills/resize-observer').then((mod) => {
    window.ResizeObserver = mod.default
  })
}
```

## Version history

| Version   | Changes                                               |
| --------- | ----------------------------------------------------- |
| `v16.3.0` | Experimental router transition start event introduced |
| `v15.3`   | `instrumentation-client` introduced                   |
