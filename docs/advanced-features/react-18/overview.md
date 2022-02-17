# React 18

[React 18](https://reactjs.org/blog/2021/06/08/the-plan-for-react-18.html) adds new features including Suspense, automatic batching of updates, APIs like `startTransition`, and a new streaming API for server rendering with support for `React.lazy`.
Next.js also provides streaming related APIs, please checkout [next/streaming](/docs/api-reference/next/streaming.md) for details.

React 18 is now in Release Candidate (RC). Read more about React 18's [release plan](https://reactjs.org/blog/2021/06/08/the-plan-for-react-18.html) and discussions from the [working group](https://github.com/reactwg/react-18/discussions).

## Using React 18 with Next.js

Install the RC version of React 18:

```jsx
npm install next@latest react@rc react-dom@rc
```

You can now start using React 18's new APIs like `startTransition` and `Suspense` in Next.js.

## Streaming SSR (Alpha)

Streaming server-rendering (SSR) is an experimental feature in Next.js 12. When enabled, SSR will use the same [Edge Runtime](/docs/api-reference/edge-runtime.md) as [Middleware](/docs/middleware.md).

[Learn how to enable streaming in Next.js.](/docs/advanced-features/react-18/streaming.md)

## React Server Components (Alpha)

Server Components are a new feature in React that let you reduce your JavaScript bundle size by separating server and client-side code. Server Components allow developers to build apps that span the server and client, combining the rich interactivity of client-side apps with the improved performance of traditional server rendering.

Server Components are still in research and development. [Learn how to try Server Components](/docs/advanced-features/react-18/server-components.md) as an experimental feature in Next.js.
