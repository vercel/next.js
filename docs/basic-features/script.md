---
description: Next.js helps you optimize loading third-party scripts with the built-in next/script component.
---

# Script Component

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-google-tag-manager">Google Tag Manager</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-google-analytics">Google Analytics</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-facebook-pixel">Facebook Pixel</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-clerk">Clerk</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics">Segment Analytics</a></li>
  </ul>
</details>

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                   |
| --------- | ------------------------- |
| `v11.0.0` | `next/script` introduced. |

</details>

The Next.js Script component, [`next/script`](/docs/api-reference/next/script.md), is an extension of the HTML `<script>` element. It enables developers to set the loading priority of third-party scripts anywhere in their application without needing to append directly to `next/head`, saving developer time while improving loading performance.

```jsx
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script src="https://www.google-analytics.com/analytics.js" />
    </>
  )
}
```

## Overview

Websites often use third-party scripts to include different types of functionality into their site, such as analytics, ads, customer support widgets, and consent management. However, this can introduce problems that impact both user and developer experience:

- Some third-party scripts are heavy on loading performance and can drag down the user experience, especially if they are render-blocking and delay any page content from loading
- Developers often struggle to decide where to place third-party scripts in an application to ensure optimal loading

The Script component makes it easier for developers to place a third-party script anywhere in their application while taking care of optimizing its loading strategy.

## Usage

To add a third-party script to your application, import the `next/script` component:

```jsx
import Script from 'next/script'
```

### Strategy

With `next/script`, you decide when to load your third-party script by using the `strategy` property:

```jsx
<Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" />
```

There are three different loading strategies that can be used:

- `beforeInteractive`: Load before the page is interactive
- `afterInteractive`: (**default**): Load immediately after the page becomes interactive
- `lazyOnload`: Load during idle time

#### beforeInteractive

Scripts that load with the `beforeInteractive` strategy are injected into the initial HTML from the server and run before self-bundled JavaScript is executed. This strategy should be used for any critical scripts that need to be fetched and executed before the page is interactive.

```jsx
<Script
  src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"
  strategy="beforeInteractive"
/>
```

Examples of scripts that should be loaded as soon as possible with this strategy include:

- Bot detectors
- Cookie consent managers

#### afterInteractive

Scripts that use the `afterInteractive` strategy are injected client-side and will run after Next.js hydrates the page. This strategy should be used for scripts that do not need to load as soon as possible and can be fetched and executed immediately after the page is interactive.

```jsx
<Script
  strategy="afterInteractive"
  dangerouslySetInnerHTML={{
    __html: `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer', 'GTM-XXXXXX');
  `,
  }}
/>
```

Examples of scripts that are good candidates to load immediately after the page becomes interactive include:

- Tag managers
- Analytics

#### lazyOnload

Scripts that use the `lazyOnload` strategy are loaded late after all resources have been fetched and during idle time. This strategy should be used for background or low priority scripts that do not need to load before or immediately after a page becomes interactive.

```jsx
<Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" />
```

Examples of scripts that do not need to load immediately and can be lazy-loaded include:

- Chat support plugins
- Social media widgets

### Inline Scripts

Inline scripts, or scripts not loaded from an external file, are also supported by the Script component. They can be written by placing the JavaScript within curly braces:

```jsx
<Script id="show-banner" strategy="lazyOnload">
  {`document.getElementById('banner').classList.remove('hidden')`}
</Script>
```

Or by using the `dangerouslySetInnerHTML` property:

```jsx
<Script
  id="show-banner"
  dangerouslySetInnerHTML={{
    __html: `document.getElementById('banner').classList.remove('hidden')`,
  }}
/>
```

There are two limitations to be aware of when using the Script component for inline scripts:

- Only the `afterInteractive` and `lazyOnload` strategies can be used. The `beforeInteractive` loading strategy injects the contents of an external script into the initial HTML response. Inline scripts already do this, which is why **the `beforeInteractive` strategy cannot be used with inline scripts.**
- An `id` attribute must be defined in order for Next.js to track and optimize the script

### Executing Code After Loading (`onLoad`)

Some third-party scripts require users to run JavaScript code after the script has finished loading in order to instantiate content or call a function. If you are loading a script with either `beforeInteractive` or `afterInteractive` as a loading strategy, you can execute code after it has loaded using the `onLoad` property:

```jsx
import { useState } from 'react'
import Script from 'next/script'

export default function Home() {
  const [stripe, setStripe] = useState(null)

  return (
    <>
      <Script
        id="stripe-js"
        src="https://js.stripe.com/v3/"
        onLoad={() => {
          setStripe({ stripe: window.Stripe('pk_test_12345') })
        }}
      />
    </>
  )
}
```

### Additional Attributes

There are many DOM attributes that can be assigned to a `<script>` element that are not used by the Script component, like [`nonce`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/nonce) or [custom data attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/data-*). Including any additional attributes will automatically forward it to the final, optimized `<script>` element that is outputted to the page.

```jsx
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
