# Streaming SSR

React 18 includes architectural improvements to React server-side rendering (SSR) performance. This means you can use `Suspense` in your React components in streaming SSR mode and React will render content on the server and send updates through HTTP streams.

## Using Streaming Server-Rendering

When you use Suspense in a server-rendered page, there is no extra configuration required to use streaming SSR. When deployed, streaming can be utilized through infrastructure like [Edge Functions](https://vercel.com/edge) on Vercel (with the Edge Runtime) or with a Node.js server (with the Node.js runtime). AWS Lambda Functions do not currently support streaming responses.

All SSR pages have the ability to render components into streams and the client continues receiving updates from these streams even after the initial SSR response is sent. When any suspended components resolve down the line, they are rendered on the server and streamed to the client. This means applications can start emitting HTML even _before_ all the data is ready, improving your app's loading performance.

As an added bonus, in streaming SSR mode the client will also use selective hydration to prioritize component hydration based on user interactions, further improving performance.

For non-SSR pages, all Suspense boundaries will still be [statically optimized](/docs/advanced-features/automatic-static-optimization.md).

## Streaming Features

### next/dynamic

Next.js supports lazy loading external libraries with `import()` and React components with `next/dynamic`. Deferred loading helps improve the initial loading performance by decreasing the amount of JavaScript necessary to render the page. Components or libaries are only imported and included in the JavaScript bundle when they're used.

Read more about how to use [`next/dynamic`](/docs/advanced-features/dynamic-import.md).

## Important Notes

#### `next/head` and `next/script`

Using resource tags (e.g. scripts or stylesheets) in `next/head` won't work as intended with streaming, as the loading order and timing of `next/head` tags can no longer be guaranteed once you add Suspense boundaries. We suggest moving resource tags to `next/script` with the `afterInteractive` or `lazyOnload` strategy, or to `_document`. For similar reasons, we also suggest migrating `next/script` instances with the `beforeInteractive` strategy to `_document`.

#### Data Fetching

Data fetching within `Suspense` boundaries is currently only supported on the client side. **Server-side data fetching is not supported** yet. Read the [Layouts RFC](https://nextjs.org/blog/layouts-rfc) for more information about the future of data fetching on the server.

#### Styling

The following solutions are compatible with Next.js streaming:

- Inline Styles
- [Global Stylesheets](/docs/basic-features/built-in-css-support.md#adding-a-global-stylesheet)
- [CSS Modules](/docs/basic-features/built-in-css-support.md#adding-component-level-css)
- [styled-jsx](/docs/basic-features/built-in-css-support.md#css-in-js)

CSS-in-JS solutions like `styled-components` and `emotion` are currently not compatible with streaming. For library authors, check out the [upgrade guide](https://github.com/reactwg/react-18/discussions/110) to learn more.
