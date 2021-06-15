---
description: Next.js helps you optimize loading third-party scripts with the built-in next/script component.
---

# Script Component

Since version **11**, Next.js has a built-in Script component.

Example of usage

```js
import Script from 'next/script'

// Before
<Script
  async
  src="https://www.google-analytics.com/analytics.js"
/>

// After
<Script
  src="https://www.google-analytics.com/analytics.js"
/>
```

Three loading strategies will be initially supported for wrapping third-party scripts:

- beforeInteractive
  - script is fetched and executed _before_ page is interactive (i.e. before self-bundled javascript is executed)
  - script is injected in SSR’s HTML - similar to self-bundled JS
- afterInteractive (**default**)
  - script is fetched and executed _after_ page is interactive (i.e. after self-bundled javascript is executed)
  - script is injected during hydration and will execute soon after hydration
- lazyOnload
  - script is injected at onload, and will execute in a subsequent idle period (using `requestIdleCallback`)

NOTE: above strategies work the same for inline scripts wrapped with ScriptLoader.

Example scenarios

```js
import Script from 'next/script'


// Loading polyfills before-interactive
<Script
  src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserverEntry%2CIntersectionObserver"
  strategy="beforeInteractive"
></Script>

// Lazy load FB scripts
<Script
  src="https://connect.facebook.net/en_US/sdk.js"
  strategy="lazyOnload"
></Script>

// Use the onLoad callback to execute code on script load
<Script id="stripe-js" src="https://js.stripe.com/v3/" onLoad={() => {
  this.setState({stripe: window.Stripe('pk_test_12345')});
}}></Script>

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
></Script>
```

## Which third-party scripts to wrap with Script Loader

We recommend the following Script Loader strategies for these categories of third-party scripts

| Loading strategy  | third-party categories                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| beforeInteractive | polyfill.io<br>Bot detection, security & authentication<br>User consent management (GDPR)    |
| afterInteractive  | Tag-managers<br>Analytics                                                                    |
| lazyOnload        | customer relationship management eg. Google feedback, chat support widget<br>social networks |
