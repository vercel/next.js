---
description: Measure and track page performance using Next.js's build-in performance relayer
---

# Measuring performance

Next.js has a built-in relayer that allows you to analyze and measure the performance of
pages using different metrics.

To measure any of the supported metrics, you will need to create a [custom
App](/docs/advanced-features/custom-app.md) component and define a `reportWebVitals` function:

```js
// pages/_app.js
export function reportWebVitals(metric) {
  console.log(metric)
}

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
```

This function is fired when the final values for any of the metrics have finished calculating on
the page. You can use to log any of the results to the console or send to a particular endpoint.

The `metric` object returned to the function consists of a number of properties:

- `id`: Unique identifier for the metric in the context of the current page load
- `name`: Metric name
- `startTime`: First recorded timestamp of the performance entry in [milliseconds](https://developer.mozilla.org/en-US/docs/Web/API/DOMHighResTimeStamp) (if applicable)
- `value`: Value, or duration in [milliseconds](https://developer.mozilla.org/en-US/docs/Web/API/DOMHighResTimeStamp), of the performance entry
- `label`: Type of metric (`web-vital` or `custom`)

There are two types of metrics that are tracked:

- Web Vitals
- Custom metrics

## Web Vitals

[Web Vitals](https://web.dev/vitals/) are a set of useful metrics that aim to capture the user
experience of a web page. The following web vitals are all included:

- [Time to First Byte](https://developer.mozilla.org/en-US/docs/Glossary/Time_to_first_byte) (TTFB)
- [First Contentful Paint](https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint) (FCP)
- [Largest Contentful Paint](https://web.dev/lcp/) (LCP)
- [First Input Delay](https://web.dev/fid/) (FID)
- [Cumulative Layout Shift](https://web.dev/cls/) (CLS)

You can handle all the results of these metrics using the `web-vital` label:

```js
export function reportWebVitals(metric) {
  if (metric.label === 'web-vital') {
    console.log(metric) // The metric object ({ id, name, startTime, value, label }) is logged to the console
  }
}
```

There's also the option of handling each of the metrics separately:

```js
export function reportWebVitals(metric) {
  switch (metric.name) {
    case 'FCP':
      // handle FCP results
      break
    case 'LCP':
      // handle LCP results
      break
    case 'CLS':
      // handle CLS results
      break
    case 'FID':
      // handle FID results
      break
    case 'TTFB':
      // handle TTFB results
      break
    default:
      break
  }
}
```

A third-party library, [web-vitals](https://github.com/GoogleChrome/web-vitals), is used to measure
these metrics. Browser compatibility depends on the particular metric, so refer to the [Browser
Support](https://github.com/GoogleChrome/web-vitals#browser-support) section to find out which
browsers are supported.

## Custom metrics

In addition to the core metrics listed above, there are some additional custom metrics that
measure the time it takes for the page to hydrate and render:

- `Next.js-hydration`: Length of time it takes for the page to start and finish hydrating (in ms)
- `Next.js-route-change-to-render`: Length of time it takes for a page to start rendering after a
  route change (in ms)
- `Next.js-render`: Length of time it takes for a page to finish render after a route change (in ms)

You can handle all the results of these metrics using the `custom` label:

```js
export function reportWebVitals(metric) {
  if (metric.label === 'custom') {
    console.log(metric) // The metric object ({ id, name, startTime, value, label }) is logged to the console
  }
}
```

There's also the option of handling each of the metrics separately:

```js
export function reportWebVitals(metric) {
  switch (metric.name) {
    case 'Next.js-hydration':
      // handle hydration results
      break
    case 'Next.js-route-change-to-render':
      // handle route-change to render results
      break
    case 'Next.js-render':
      // handle render results
      break
    default:
      break
  }
}
```

These metrics work in all browsers that support the [User Timing API](https://caniuse.com/#feat=user-timing).

## Sending results to analytics

With the relay function, you can send any of results to an analytics endpoint to measure and track
real user performance on your site. For example:

```js
export function reportWebVitals(metric) {
  const body = JSON.stringify(metric)
  const url = 'https://example.com/analytics'

  // Use `navigator.sendBeacon()` if available, falling back to `fetch()`.
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, body)
  } else {
    fetch(url, { body, method: 'POST', keepalive: true })
  }
}
```

> **Note**: If you use [Google Analytics](https://analytics.google.com/analytics/web/), using the
> `id` value can allow you to construct metric distributions manually (to calculate percentiles,
> etc...).
>
> ```js
> export function reportWebVitals({ id, name, label, value }) {
>   // Use `window.gtag` if you initialized Google Analytics as this example:
>   // https://github.com/vercel/next.js/blob/canary/examples/with-google-analytics/pages/_document.js
>   window.gtag('event', name, {
>     event_category:
>       label === 'web-vital' ? 'Web Vitals' : 'Next.js custom metric',
>     value: Math.round(name === 'CLS' ? value * 1000 : value), // values must be integers
>     event_label: id, // id unique to current page load
>     non_interaction: true, // avoids affecting bounce rate.
>   })
> }
> ```
>
> Read more about sending results to Google Analytics [here](https://github.com/GoogleChrome/web-vitals#send-the-results-to-google-analytics).

## TypeScript

If you are using TypeScript, you can use the built-in type `NextWebVitalsMetric`:

```ts
// pages/_app.tsx

import type { AppProps, NextWebVitalsMetric } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export function reportWebVitals(metric: NextWebVitalsMetric) {
  console.log(metric)
}

export default MyApp
```
