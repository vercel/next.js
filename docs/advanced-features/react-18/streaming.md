# Streaming SSR (Alpha)

React 18 will include architectural improvements to React server-side rendering (SSR) performance. This means you can use `Suspense` in your React components in streaming SSR mode and React will render them on the server and send them through HTTP streams.
It's worth noting that another experimental feature, React Server Components, is based on streaming. You can read more about server components related streaming APIs like [`next/streaming`](docs/api-reference/next/streaming.md). However, this guide focuses on basic React 18 streaming.

## Enable Streaming SSR

Enabling streaming SSR means React renders your components into streams and client continues receiving the updating fragments from server, which lets you start emitting the HTML as early as possible. You can break down your app into few smaller independent units by `Suspense`. The client will use selective hydration strategy to prioritize the components hydration which lets users interact with the them efficiently.

To enable streaming SSR, set the experimental flag `concurrentFeatures` to `true`:

```jsx
// next.config.js
module.exports = {
  experimental: {
    concurrentFeatures: true,
  },
}
```

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

Check out [next/streaming](/docs/api-reference/next/streaming.md) for more details for building Next.js apps in streaming SSR mode.

## Important Notes

#### Data Fetching

Currently, data fetching within `Suspense` boundaries on the server side is not fully supported, which could lead to mismatching between server and client. In the short-term, please don't try data fetching within `Suspense`.

#### Styling

The Next.js team is still working on support for styled-jsx and CSS modules in streaming SSR. Please stay tuned for updates!
