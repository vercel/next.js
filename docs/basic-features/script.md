---
description: Next.js helps you optimize loading third-party scripts with the built-in next/script component.
---

# Script Component

Since version **11**, Next.js has a built-in Script component.

Example of usage:

```js
// Before

// pages/index.js
import Head from 'next/head'

function Home() {
  return (
    <>
      <Head>
        <script async src="https://www.google-analytics.com/analytics.js" />
      </Head>
    </>
  )
}

// After

// pages/index.js

function Home() {
  return (
    <>
      <Script src="https://www.google-analytics.com/analytics.js" />
    </>
  )
}
```

> Note: `next/script` should **not** be wrapped in `next/head`.

> Note: `next/script` should **not** be used in `pages/_document.js` as `next/script` has client-side functionality to ensure loading order.

Three loading strategies will be initially supported for wrapping third-party scripts:

- `beforeInteractive`
  - script is fetched and executed _before_ page is interactive (i.e. before self-bundled javascript is executed)
  - script is injected in SSR’s HTML - similar to self-bundled JS
- `afterInteractive` (**default**)
  - script is fetched and executed _after_ page is interactive (i.e. after self-bundled javascript is executed)
  - script is injected during hydration and will execute soon after hydration
- `lazyOnload`
  - script is injected at `onload`, and will execute in a subsequent idle period (using `requestIdleCallback`)

> Note: above strategies work the same for inline scripts wrapped with `<Script>`.

## Example scenarios

```js
import Script from 'next/script'

// Loading polyfills before-interactive
<Script
  src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserverEntry%2CIntersectionObserver"
  strategy="beforeInteractive"
/>

// Lazy load FB scripts
<Script
  src="https://connect.facebook.net/en_US/sdk.js"
  strategy="lazyOnload"
/>

// Use the onLoad callback to execute code on script load
<Script id="stripe-js" src="https://js.stripe.com/v3/" onLoad={() => {
  this.setState({stripe: window.Stripe('pk_test_12345')});
}} />

// Loading strategy works for inline scripts too
<Script strategy="lazyOnload">
  {`document.getElementById('banner').removeClass('hidden')`}
</Script>

// or
<Script
  dangerouslySetInnerHTML={{
    __html: `document.getElementById('banner').removeClass('hidden')`,
  }}
>
</Script>

// All script attributes are forwarded to the final element
<Script
  src="https://www.google-analytics.com/analytics.js"
  id="analytics"
  nonce="XUENAJFW"
  data-test="analytics"
/>
```

## Which third-party scripts to wrap with Script Loader

We recommend the following Script Loader strategies for these categories of third-party scripts:

- `beforeInteractive`
  - [polyfill.io](https://polyfill.io)
  - Bot detection
  - Security and Authentication
  - User consent management (GDPR)
- `afterInteractive`
  - Tag-managers
  - Analytics
- `lazyOnload`
  - Customer relationship management
  - Google feedback
  - Chat support widget
  - Social networks
