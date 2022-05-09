# Switchable Runtime (Alpha)

By default, Next.js uses Node.js as the runtime for page rendering, including pre-rendering and server-side rendering.

If you have [React 18](/docs/advanced-features/react-18/overview) installed, there is a new experimental feature that lets you switch the page runtime between Node.js and the [Edge Runtime](/docs/api-reference/edge-runtime). Changing the runtime affects [SSR streaming](/docs/advanced-features/react-18/streaming) and [Server Components](/docs/advanced-features/react-18/server-components) features, as well.

## Global Runtime Option

You can set the experimental option `runtime` to either `'nodejs'` or `'edge'` in your `next.config.js` file:

```jsx
// next.config.js
module.exports = {
  experimental: {
    runtime: 'nodejs',
  },
}
```

This option determines which runtime should be used as the default rendering runtime for all pages.

## Page Runtime Option

On each page, you can optionally export a `runtime` config set to either `'nodejs'` or `'edge'`:

```jsx
export const config = {
  runtime: 'nodejs',
}
```

When both the per-page runtime and global runtime are set, the per-page runtime overrides the global runtime. If the per-page runtime is _not_ set, the global runtime option will be used.

You can refer to the [Switchable Next.js Runtime RFC](https://github.com/vercel/next.js/discussions/34179) for more information.

**Note:** The page runtime option is not supported in [API Routes](/docs/api-routes/introduction.md) currently.
