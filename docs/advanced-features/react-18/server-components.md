# React Server Components (RFC)

Server Components allow us to render React components on the server. This is fundamentally different from server-side rendering (SSR) where you're pre-generating HTML on the server. With Server Components, there's **zero client-side JavaScript needed,** making page rendering faster. This improves the user experience of your application, pairing the best parts of server-rendering with client-side interactivity.

### Next Router and Layouts RFC

We are currently implementing the [Next.js Router and Layouts RFC](https://nextjs.org/blog/layouts-rfc).

The new Next.js router will be built on top of React 18 features, including React Server Components.

One of the biggest proposed changes is that, by default, files inside a new `app` directory will be rendered on the server as React Server Components.

This will allow you to automatically adopt React Server Components when migrating from `pages` to `app`.

You can find more information on the [RFC](https://nextjs.org/blog/layouts-rfc) and we welcome your feedback on [Github Discussions](https://github.com/vercel/next.js/discussions/37136).

### Server Components Conventions

To run a component on the server, append `.server.js` to the end of the filename. For example, `./pages/home.server.js` will be treated as a Server Component.

For client components, append `.client.js` to the filename. For example, `./components/avatar.client.js`.

Server components can import server components and client components.

Client components **cannot** import server components.

Components without a `server` or `client` extension will be treated as shared components and can be imported by server components and client components. For example:

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

The `<Home>` and `<Profile>` components will always be server-side rendered and streamed to the client, and will not be included by the client-side JavaScript. However, `<Content>` will still be hydrated on the client-side, like normal React components.

> Make sure you're using default imports and exports for server components (`.server.js`). The support of named exports are a work in progress!

To see a full example, check out the [vercel/next-react-server-components demo](https://github.com/vercel/next-react-server-components).

## Supported Next.js APIs

### `next/link` and `next/image`

You can use `next/link` and `next/image` like before and they will be treated as client components to keep the interaction on client side.

### `next/document`

If you have a custom `_document`, you have to change your `_document` to a functional component like below to use server components. If you don't have one, Next.js will use the default `_document` component for you.

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

The usage of `_app.js` is the same as [Custom App](/docs/advanced-features/custom-app). Using custom app as server component such as `_app.server.js` is not recommended, to keep align with non server components apps for client specific things like global CSS imports.

### Routing

Both basic routes with path and queries and dynamic routes are supported. If you need to access the router in server components(`.server.js`), they will receive `router` instance as a prop so that you can directly access them without using the `useRouter()` hook.

```jsx
// pages/index.server.js

export default function Index({ router }) {
  // You can access routing information by `router.pathname`, etc.
  return 'hello'
}
```

### Unsupported Next.js APIs

While RSC and SSR streaming are still in the alpha stage, not all Next.js APIs are supported. The following Next.js APIs have limited functionality within Server Components. React 18 use without SSR streaming is not affected.

#### React internals

Most React hooks, such as `useContext`, `useState`, `useReducer`, `useEffect` and `useLayoutEffect`, are not supported as of today since server components are executed per request and aren't stateful.

#### Data Fetching & Styling

Like streaming SSR, styling and data fetching within `Suspense` on the server side are not well supported. We're still working on them.

Page level exported methods like `getInitialProps`, `getStaticProps` and `getStaticPaths` are not supported.

#### `next/head` and I18n

We are still working on support for these features.
