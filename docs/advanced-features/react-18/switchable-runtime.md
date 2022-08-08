# Switchable Runtime (Alpha)

Next.js has two _server runtimes_ to run your application: the **Node.js Runtime** (default) and the [**Edge Runtime**](/docs/api-reference/edge-runtime.md). When server-rendering or serving API routes, the application code will be executed in the Node.js Runtime by default; and for [Middleware](/docs/middleware.md), it will be running in the Edge Runtime.

|                                                                                             | Node (server) | Node (lambda) | Edge             |
| ------------------------------------------------------------------------------------------- | ------------- | ------------- | ---------------- |
| [Cold Boot](https://vercel.com/docs/concepts/functions/conceptual-model#cold-and-hot-boots) | /             | ~250ms        | Instant          |
| [HTTP Streaming](https://github.com/reactwg/react-18/discussions/37)                        | Yes           | No            | Yes              |
| IO                                                                                          | All           | All           | `fetch`          |
| Scalability                                                                                 | /             | High          | Highest          |
| Security                                                                                    | Normal        | High          | High             |
| Latency                                                                                     | Normal        | Low           | Lowest           |
| Code Size                                                                                   | /             | 50MB          | 1MB              |
| NPM Packages                                                                                | All           | All           | A smaller subset |

Next.js' default runtime configuration is good for most use cases, but there’re still many reasons to change to one runtime over the other one. For example, to enable [React 18's](/docs/advanced-features/react-18/overview) [SSR streaming](/docs/advanced-features/react-18/streaming.md) feature, you need to use a runtime that is compatible with Web Streams. For API routes that rely on native Node.js APIs, they need to run with the **Node.js Runtime**. However, if an API only uses something like cookie-based authentication, using Middleware and the [**Edge Runtime**](/docs/api-reference/edge-runtime.md) will be a better choice due to its lower latency as well as better scalability.

Starting with `12.2`, Next.js enables you to customize the runtime for each Next.js route, for both Pages and API routes.

## Global Runtime Option

You can set the experimental option `runtime` to either `'nodejs'` or `'experimental-edge'` in your `next.config.js` file:

```jsx
// next.config.js
module.exports = {
  experimental: {
    runtime: 'experimental-edge',
  },
}
```

This option determines which runtime should be used as the default rendering runtime for all pages.

You can detect which runtime you're using by looking at the `process.env.NEXT_RUNTIME` Environment Variable during runtime, and examining the `options.nextRuntime` variable during webpack compilation.

## Page Runtime Option

On each page, you can optionally export a `runtime` config set to either `'nodejs'` or `'experimental-edge'`:

```jsx
// pages/index.js
export default function Index () { ... }

export function getServerSideProps() { ... }

export const config = {
  runtime: 'experimental-edge',
}
```

When both the per-page runtime and global runtime are set, the per-page runtime overrides the global runtime. If the per-page runtime is _not_ set, the global runtime option will be used.

## Edge API Routes

[Edge API Routes](/docs/api-routes/edge-api-routes.md) enable you to build high performance APIs with Next.js using the Edge Runtime.

```typescript
export const config = {
  runtime: 'experimental-edge',
}

export default (req) => new Response('Hello world!')
```

## Related

<div class="card">
  <a href="/docs/api-reference/edge-runtime.md">
    <b>Edge Runtime</b>
    <small>Learn more about the supported Web APIs available.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-reference/next/server.md">
    <b>Middleware API Reference</b>
    <small>Learn more about the supported APIs for Middleware.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-routes/edge-api-routes.md">
    <b>Edge API Routes</b>
    <small>Build high performance APIs in Next.js. </small>
  </a>
</div>
