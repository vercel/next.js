---
description: Optimize your third-party scripts with the built-in `next/script` component.
---

# Optimizing Scripts

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/script-component">Script Component</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-google-tag-manager">Google Tag Manager</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-google-analytics">Google Analytics</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-facebook-pixel">Facebook Pixel</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-clerk">Clerk</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics">Segment Analytics</a></li>
  </ul>
</details>

The **Script component**, [`next/script`](/docs/api-reference/next/script.md), allows you to optimally load third-party scripts anywhere in your Next.js application. It is an extension of the HTML `<script>` element and enables you to choose between multiple loading strategies to fit your use case.

## Overview

Websites often use third-party scripts to add functionality like analytics, ads, customer support widgets, and consent management. However, this can introduce problems that impact both user and developer experience:

- Some third-party scripts decrease loading performance and can degrade the user experience, especially if they are blocking the page content from being displayed.
- Developers are often unsure where and how to load third-party scripts in an application without impacting page performance.

Browsers load and execute `<script>` elements based on the order of placement in HTML and the usage of `async` and `defer` attributes. However, using the native `<script>` element creates some challenges:

- As your application grows in size and complexity, it becomes increasingly difficult to manage the loading order of third-party scripts.
- [Streaming and Suspense](https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense) improve page performance by rendering and hydrating new content as soon as possible, but `<script>` attributes (like `defer`) are incompatible without additional work.

The Script component solves these problems by providing a declarative API for loading third-party scripts. It provides a set of built-in loading strategies that can be used to optimize the loading sequence of scripts with support for streaming. Each of the strategies provided by the Script component uses the best possible combination of React and Web APIs to ensure that scripts are loaded with minimal impact to page performance.

## Usage

To get started, import the [`next/script`](/docs/api-reference/next/script.md) component:

```jsx
import Script from 'next/script'
```

### Page Scripts

To load a third-party script in a single route, import `next/script` and include the script directly in your page component:

```jsx
import Script from 'next/script'

export default function Dashboard() {
  return (
    <>
      <Script src="https://example.com/script.js" />
    </>
  )
}
```

The script will only be fetched and executed when this specific page is loaded on the browser.

### Application Scripts

To load a third-party script for all routes, import `next/script` and include the script directly in `pages/_app.js`:

```jsx
import Script from 'next/script'

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script src="https://example.com/script.js" />
      <Component {...pageProps} />
    </>
  )
}
```

This script will load and execute when _any_ route in your application is accessed. Next.js will ensure the script will **only load once**, even if a user navigates between multiple pages.

> **Note**: You should rarely need to load a third-party script for every page of your application. We recommend only including third-party scripts in specific pages in order to minimize any unnecessary impact to performance.

### Strategy

Although the default behavior of `next/script` allows you load third-party scripts in any page, you can fine-tune its loading behavior by using the `strategy` property:

- `beforeInteractive`: Load the script before any Next.js code and before any page hydration occurs.
- `afterInteractive`: (**default**) Load the script early but after some hydration on the page occurs.
- `lazyOnload`: Load the script later during browser idle time.
- `worker`: (experimental) Load the script in a web worker.

Refer to the [`next/script`](/docs/api-reference/next/script.md#strategy) API reference documentation to learn more about each strategy and their use cases.

> **Note**: Once a `next/script` component has been loaded by the browser, it will stay in the DOM and client-side navigations won't re-execute the script.

### Offloading Scripts To A Web Worker (experimental)

> **Note:** The `worker` strategy is not yet stable and does not yet work with the [`app/`](https://beta.nextjs.org/docs/routing/defining-routes) directory. Use with caution.

Scripts that use the `worker` strategy are offloaded and executed in a web worker with [Partytown](https://partytown.builder.io/). This can improve the performance of your site by dedicating the main thread to the rest of your application code.

This strategy is still experimental and can only be used if the `nextScriptWorkers` flag is enabled in `next.config.js`:

```js
module.exports = {
  experimental: {
    nextScriptWorkers: true,
  },
}
```

Then, run `next` (normally `npm run dev` or `yarn dev`) and Next.js will guide you through the installation of the required packages to finish the setup:

```bash
npm run dev

# You'll see instructions like these:
#
# Please install Partytown by running:
#
#         npm install @builder.io/partytown
#
# ...
```

Once setup is complete, defining `strategy="worker"` will automatically instantiate Partytown in your application and offload the script to a web worker.

```jsx
import Script from 'next/script'

export default function Home() {
  return (
    <>
      <Script src="https://example.com/script.js" strategy="worker" />
    </>
  )
}
```

There are a number of trade-offs that need to be considered when loading a third-party script in a web worker. Please see Partytown's [tradeoffs](https://partytown.builder.io/trade-offs) documentation for more information.

### Inline Scripts

Inline scripts, or scripts not loaded from an external file, are also supported by the Script component. They can be written by placing the JavaScript within curly braces:

```jsx
<Script id="show-banner" strategy="afterInteractive">
  {`document.getElementById('banner').classList.remove('hidden')`}
</Script>
```

Or by using the `dangerouslySetInnerHTML` property:

```jsx
<Script
  id="show-banner"
  strategy="afterInteractive"
  dangerouslySetInnerHTML={{
    __html: `document.getElementById('banner').classList.remove('hidden')`,
  }}
/>
```

> **Note**: An `id` property must be assigned for inline scripts in order for Next.js to track and optimize the script.

### Executing Additional Code

Event handlers can be used with the Script component to execute additional code after a certain event occurs:

- `onLoad`: Execute code after the script has finished loading.
- `onReady`: Execute code after the script has finished loading and every time the component is mounted.
- `onError`: Execute code if the script fails to load.

```jsx
import Script from 'next/script'

export default function Page() {
  return (
    <>
      <Script
        src="https://example.com/script.js"
        onLoad={() => {
          console.log('Script has loaded')
        }}
      />
    </>
  )
}
```

Refer to the [`next/script`](/docs/api-reference/next/script.md#onload) API reference to learn more about each event handler and view examples.

### Additional Attributes

There are many DOM attributes that can be assigned to a `<script>` element that are not used by the Script component, like [`nonce`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/nonce) or [custom data attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/data-*). Including any additional attributes will automatically forward it to the final, optimized `<script>` element that is included in the HTML.

```jsx
import Script from 'next/script'

export default function Page() {
  return (
    <>
      <Script
        src="https://example.com/script.js"
        id="example-script"
        nonce="XUENAJFW"
        data-test="script"
      />
    </>
  )
}
```

## Next Steps

<div class="card">
  <a href="/docs/api-reference/next/script.md">
    <b>next/script API Reference</b>
    <small>View the API for the Script component.</small>
  </a>
</div>
