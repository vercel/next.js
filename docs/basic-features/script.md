---
description: Next.js helps you optimize loading third-party scripts with the built-in next/script component.
---

# Script Component

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                   |
| --------- | ------------------------- |
| `v11.0.0` | `next/script` introduced. |

</details>

The Next.js Script component enables developers to set the loading priority of third-party scripts to save developer time and improve loading performance.

Websites often need third parties for things like analytics, ads, customer support widgets, and consent management. However, these scripts tend to be heavy on loading performance and can drag down the user experience. Developers often struggle to decide where to place them in an application for optimal loading.

With `next/script`, you can define the `strategy` property and Next.js will optimize loading for the script:

- `beforeInteractive`: For critical scripts that need to be fetched and executed **before** the page is interactive, such as bot detection and consent management. These scripts are injected into the initial HTML from the server and run before self-bundled JavaScript is executed.
- `afterInteractive` (**default**): For scripts that can fetch and execute **after** the page is interactive, such as tag managers and analytics. These scripts are injected on the client-side and will run after hydration.
- `lazyOnload` For scripts that can wait to load during idle time, such as chat support and social media widgets.

> **Note:**
>
> - `<Script>` supports inline scripts with `afterInteractive` and `lazyOnload` strategy.
> - Inline scripts wrapped with `<Script>` _require an `id` attribute to be defined_ to track and optimize the script.

## Usage

Previously, you needed to define `script` tags inside the `Head` of your Next.js page.

```js
// Before

// pages/index.js
import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <script async src="https://www.google-analytics.com/analytics.js" />
      </Head>
    </>
  )
}
```

With `next/script`, you no longer need to wrap scripts in `next/head`. Further, `next/script` should **not** be used in `pages/_document.js` as `next/script` has client-side functionality to ensure loading order. For example:

```js
// After

// pages/index.js
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script src="https://www.google-analytics.com/analytics.js" />
    </>
  )
}
```

## Examples

### Loading Polyfills

```js
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script
        src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserverEntry%2CIntersectionObserver"
        strategy="beforeInteractive"
      />
    </>
  )
}
```

### Lazy-Loading

```js
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
      />
    </>
  )
}
```

### Executing Code After Loading (`onLoad`)

```js
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script
        id="stripe-js"
        src="https://js.stripe.com/v3/"
        onLoad={() => {
          this.setState({ stripe: window.Stripe('pk_test_12345') })
        }}
      />
    </>
  )
}
```

### Inline Scripts

```js
import Script from 'next/script'

<Script strategy="lazyOnload">
  {`document.getElementById('banner').removeClass('hidden')`}
</Script>

// or

<Script
  dangerouslySetInnerHTML={{
    __html: `document.getElementById('banner').removeClass('hidden')`
  }}
/>
```

### Forwarding Attributes

```js
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script
        src="https://www.google-analytics.com/analytics.js"
        id="analytics"
        nonce="XUENAJFW"
        data-test="analytics"
      />
    </>
  )
}
```
