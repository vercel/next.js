# Streaming SSR

React 18 includes architectural improvements to React server-side rendering (SSR) performance. This means you can use `Suspense` in your React components in streaming SSR mode and React will render content on the server and send updates through HTTP streams.
React Server Components, an experimental feature, is based on streaming. You can read more about Server Components related streaming APIs in [`next/streaming`](/docs/api-reference/next/streaming.md). However, this guide focuses on streaming with React 18.

## Using Streaming Server-Rendering

When you use Suspense in a server-rendered page, there is no extra configuration required to use streaming SSR. When deployed, streaming can be utilized through infrastructure like [Edge Functions](https://vercel.com/edge) on Vercel (with the Edge Runtime) or with a Node.js server (with the Node.js runtime). AWS Lambda Functions do not currently support streaming responses.

All SSR pages have the ability to render components into streams and the client continues receiving updates from these streams even after the initial SSR response is sent. When any suspended components resolve down the line, they are rendered on the server and streamed to the client. This means applications can start emitting HTML even _before_ all the data is ready, improving your app's loading performance.

As an added bonus, in streaming SSR mode the client will also use selective hydration to prioritize component hydration based on user interactions, further improving performance.

For non-SSR pages, all Suspense boundaries will still be [statically optimized](/docs/advanced-features/automatic-static-optimization.md).

## Streaming Features

### next/dynamic

Dynamic imports through `React.lazy` have better support in React 18. Previously, Next.js supported dynamic imports internally without requiring `Suspense` or `React.lazy`. Now to embrace the official APIs on the React side, we provide you with `options.suspense` in `next/dynamic`.

```jsx
import dynamic from 'next/dynamic'
import { lazy, Suspense } from 'react'

import Content from '../components/content'

// These two ways are identical:
const Profile = dynamic(() => import('./profile'), { suspense: true })
const Footer = lazy(() => import('./footer'))

export default function Home() {
  return (
    <div>
      <Suspense fallback={<Spinner />}>
        {/* A component that uses Suspense */}
        <Content />
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <Profile />
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <Footer />
      </Suspense>
    </div>
  )
}
```

Check out [`next/streaming`](/docs/api-reference/next/streaming.md) for more details on building Next.js apps in streaming SSR mode.

## Important Notes

#### `next/head` and `next/script`

Using resource tags (e.g. scripts or stylesheets) in `next/head` won't work as intended with streaming, as the loading order and timing of `next/head` tags can no longer be guaranteed once you add Suspense boundaries. We suggest moving resource tags to `next/script` with the `afterInteractive` or `lazyOnload` strategy, or to `_document`. For similar reasons, we also suggest migrating `next/script` instances with the `beforeInteractive` strategy to `_document`.

#### Data Fetching

Currently, data fetching within `Suspense` boundaries on the server side is not fully supported, which could lead to mismatching between server and client. In the short-term, please don't try data fetching within `Suspense`.

#### Styling

Inline styles, Global CSS, CSS modules and Next.js built-in `styled-jsx` are supported with streaming. The Next.js team is working on the guide of integrating other CSS-in-JS solutions in streaming SSR. Stay tuned for updates.

> Note: The styling code should be only placed in client components, not server components, when using React Server Components
