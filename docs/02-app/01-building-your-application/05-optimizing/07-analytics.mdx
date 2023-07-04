---
title: Analytics
description: Measure and track page performance using Next.js Speed Insights
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

[Next.js Speed Insights](https://nextjs.org/analytics) allows you to analyze and measure the performance of
pages using different metrics.

You can start collecting your [Real Experience Score](https://vercel.com/docs/concepts/speed-insights#core-web-vitals-explained?utm_source=next-site&utm_medium=docs&utm_campaign=next-website) with zero-configuration on [Vercel deployments](https://vercel.com/docs/concepts/speed-insights?utm_source=next-site&utm_medium=docs&utm_campaign=next-website).

The rest of this documentation describes the built-in relayer Next.js Speed Insights uses.

<PagesOnly>

## Build Your Own

First, you will need to create a [custom App](/docs/pages/building-your-application/routing/custom-app) component and define a `reportWebVitals` function:

```jsx filename="pages/_app.js"
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

</PagesOnly>

## Web Vitals

[Web Vitals](https://web.dev/vitals/) are a set of useful metrics that aim to capture the user
experience of a web page. The following web vitals are all included:

- [Time to First Byte](https://developer.mozilla.org/en-US/docs/Glossary/Time_to_first_byte) (TTFB)
- [First Contentful Paint](https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint) (FCP)
- [Largest Contentful Paint](https://web.dev/lcp/) (LCP)
- [First Input Delay](https://web.dev/fid/) (FID)
- [Cumulative Layout Shift](https://web.dev/cls/) (CLS)
- [Interaction to Next Paint](https://web.dev/inp/) (INP) _(experimental)_

<PagesOnly>

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
    case 'INP':
      // handle INP results (note: INP is still an experimental metric)
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

## Sending results to external systems

With the relay function, you can send results to any endpoint to measure and track
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

> **Good to know**: If you use [Google Analytics](https://analytics.google.com/analytics/web/), using the
> `id` value can allow you to construct metric distributions manually (to calculate percentiles,
> etc.)
>
> ```js
> export function reportWebVitals({ id, name, label, value }) {
>   // Use `window.gtag` if you initialized Google Analytics as this example:
>   // https://github.com/vercel/next.js/blob/canary/examples/with-google-analytics/pages/_app.js
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
> Read more about [sending results to Google Analytics](https://github.com/GoogleChrome/web-vitals#send-the-results-to-google-analytics).

## TypeScript

If you are using TypeScript, you can use the built-in type `NextWebVitalsMetric`:

```tsx filename="pages/_app.tsx" switcher
import type { AppProps, NextWebVitalsMetric } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export function reportWebVitals(metric: NextWebVitalsMetric) {
  console.log(metric)
}

export default MyApp
```

```jsx filename="pages/_app.js" switcher
function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export function reportWebVitals(metric) {
  console.log(metric)
}

export default MyApp
```

</PagesOnly>
