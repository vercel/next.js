# React Server Components (Alpha)

Server Components allow us to render React components on the server. This is fundamentally different from server-side rendering (SSR) where you're pre-generating HTML on the server. With Server Components, there's **zero client-side JavaScript needed,** making page rendering faster. This improves the user experience of your application, pairing the best parts of server-rendering with client-side interactivity.

### Enable React Server Components

To use React Server Components, ensure you have React 18 installed. Then, turn on the `concurrentFeatures` and `serverComponents` options in `next.config.js`:

```jsx
// next.config.js
module.exports = {
  experimental: {
    concurrentFeatures: true,
    serverComponents: true,
  },
}
```

Next, if you already have a customized `pages/_document` component. If no custom Document component is provided, Next.js will fallback to a basic functional document component. Take a look at [next/document support](#next/document) for more details.

Once you've made these changes, you can start using React Server Components. [See our example](https://github.com/vercel/next-rsc-demo) for more information.

### Server Components Conventions

To run a component on the server, append `.server.js` to the end of the filename. For example, `./pages/home.server.js` will be treated as a Server Component.

For client components, append `.client.js` to the filename. For example, `./components/avatar.client.js`.

You can then import other server or client components from any server component. Note: a server component **can not** be imported by a client component. Components without "server/client" extensions will be treated as "universal components" and can be used and rendered by both sides, depending on where it is imported. For example:

```jsx
// pages/home.server.js

import { Suspense } from 'react'

import Profile from '../components/profile.server'
import Content from '../components/content.client'

export default function Home() {
  return (
    <div>
      <h1>Welcome to React Server Components</h1>
      <Suspense fallback={'Loading...'}>
        <Profile />
      </Suspense>
      <Content />
    </div>
  )
}
```

The `<Home>` and `<Profile>` components will always be server-side rendered and streamed to the client, and will not be included by the client runtime. However, `<Content>` will still be hydrated on the client-side, like normal React components.

> Notice that make sure you're using default imports for server and client components at the moment. The the support of named exports are working in progress!

To see a full example, check out the [vercel/next-rsc-demo demo](https://github.com/vercel/next-rsc-demo).

## Supported Next.js APIs

### `next/link` and `next/image`

You can use `next/link` and `next/image` like before and they will be treated as client components to keep the interaction on client side.

### `next/document`

If you have custom `_document`, you have to change your `_document` to a functional component like below to use server components. Or if you don't have any, Next.js will provide a functional fallback `_document` component.

```jsx
// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

### `next/app`

If you're using `_app.js`, the usage is the same as [Custom App](/docs/advanced-features/custom-app).
If you're using `_app.server.js` as a server component, the signature is changed as below where it only receives the `children` prop as elements. You can wrap any other client or server components around `children` to customize the layout of your app.

```js
// pages/_app.server.js
export default function App({ children }) {
  return children
}
```

### Routing

Basic routes with path and queries, dynamic routes are supported as well. If you need to access the router in server components(`.server.js`), They will receive `router` instance as a prop so that you could directly accessing them without using `useRouter()` hook.

```jsx
// pages/index.server.js

export default function Index({ router }) {
  // You can access routing information by `router.pathname`, etc.
  return 'hello'
}
```

### Unsupported Next.js APIs

While RSC and SSR streaming is still in the alpha stage, not all Next.js APIs are supported. The following Next.js APIs have limited functionality within Server Components. Note that React 18 without SSR streaming isn't affected.

#### React internals

Most of React hooks such as `useContext`, `useState`, `useReducer`, `useEffect` and `useLayoutEffect` are not supported as of today since Server Components are executed per requests and aren't stateful.

#### Data Fetching & Styling

Like streaming SSR, styling and data fetching within `Suspense` on server side are not well supported. We're still working on them.

Page level exported methods like `getInitialProps`, `getStaticProps` and `getStaticPaths` are not supported.

#### `next/head` and I18n

We're still working on them!
