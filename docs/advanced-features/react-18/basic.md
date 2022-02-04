# React 18

[React 18](https://reactjs.org/blog/2021/06/08/the-plan-for-react-18.html) adds new features including, Suspense, automatic batching of updates, APIs like `startTransition`, and a new streaming API for server rendering with support for `React.lazy`.

React 18 is in RC now. Read more about React 18's [release plan](https://github.com/reactwg/react-18/discussions) and discussions from the [working group](https://reactjs.org/blog/2021/06/08/the-plan-for-react-18.html).

## React 18 Usage in Next.js

Ensure you have the `rc` npm tag of React installed:

```jsx
npm install next@latest react@rc react-dom@rc
```

That's all! You can now start using React 18's new APIs like `startTransition` and `Suspense` in Next.js.

## Streaming SSR (Alpha)

This is an experimental feature in Next.js 12, but once enabled, SSR will use the same [Edge Runtime](/docs/api-reference/edge-runtime.md) as [Middleware](/docs/middleware.md). Checkout [React 18 - Streaming](/docs/react-18/streaming.md) for more details.

## React Server Components (Alpha)

React Server Components is a new feature in React experimental release, which lets you reduce your code bundle size by separating server and client side code as different kinds of components and streaming the server rendered result to client.

It is still in research and development in React and Next.js provides it as an experimental feature in v12. Checkout [React 18 - Server Components](/docs/react-18/server-components.md) section for details.
