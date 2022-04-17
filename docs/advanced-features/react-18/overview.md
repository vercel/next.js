# React 18

[React 18](https://reactjs.org/blog/2022/03/29/react-v18.html) adds new features including Suspense, automatic batching of updates, APIs like `startTransition`, and a new streaming API for server rendering with support for `React.lazy`.
Next.js also provides streaming related APIs, please checkout [next/streaming](/docs/api-reference/next/streaming.md) for details.

React 18 is now released. Read more about [React 18](https://reactjs.org/blog/2022/03/29/react-v18.html).

## Using React 18 with Next.js

Install the latest version of React:

```jsx
npm install next@latest react@latest react-dom@latest
```

You can now start using React 18's new APIs like `startTransition` and `Suspense` in Next.js.

## Streaming SSR

Next.js supports React 18 streaming server-rendering (SSR) out of the box.

[Learn more about streaming in Next.js](/docs/advanced-features/react-18/streaming.md).

## React Server Components (Alpha)

Server Components are a new feature in React that let you reduce your JavaScript bundle size by separating server and client-side code. Server Components allow developers to build apps that span the server and client, combining the rich interactivity of client-side apps with the improved performance of traditional server rendering.

Server Components are still in research and development. [Learn how to try Server Components](/docs/advanced-features/react-18/server-components.md) as an experimental feature in Next.js.

## Switchable Runtime (Alpha)

Next.js supports changing the runtime of your application between Node.js and the [Edge Runtime](/docs/api-reference/edge-runtime.md) at the page level. For example, you can selectively configure specific pages to be server-side rendered in the Edge Runtime.

This feature is still experimental. [Learn more about the switchable runtime](/docs/advanced-features/react-18/switchable-runtime.md).
