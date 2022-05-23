---
description: Optimize loading of third-party scripts with the built-in Script component.
---

# next/script

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

> **Note: This is API documentation for the Script Component. For a feature overview and usage information for scripts in Next.js, please see [Script Optimization](/docs/basic-features/script.md).**

## Optional Props

### src

A path string specifying the URL of an external script. This can be either an absolute external URL or an internal path.

### strategy

The loading strategy of the script.

| `strategy`          | **Description**                                            |
| ------------------- | ---------------------------------------------------------- |
| `beforeInteractive` | Load script before the page becomes interactive            |
| `afterInteractive`  | Load script immediately after the page becomes interactive |
| `lazyOnload`        | Load script during browser idle time                       |
| `worker`            | Load script in a web worker                                |

> **Note: `worker` is an experimental strategy that can only be used when enabled in `next.config.js`. See [Off-loading Scripts To A Web Worker](/docs/basic-features/script#off-loading-scripts-to-a-web-worker-experimental).**

### onLoad

A method that returns additional JavaScript that should be executed after the script has finished loading.

> **Note: `onLoad` can't be used with the `beforeInteractive` loading strategy.**

The following is an example of how to use the `onLoad` property:

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

### onError

A method that executes if the script fails to load.

> **Note: `onError` can't be used with the `beforeInteractive` loading strategy.**

The following is an example of how to use the `onError` property:

```jsx
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script
        id="will-fail"
        src="https://example.com/non-existant-script.js"
        onError={(e) => {
          console.error('Script failed to load', e)
        }}
      />
    </>
  )
}
```
