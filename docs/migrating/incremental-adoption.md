---
description: Learn different strategies for incrementally adopting Next.js into your development workflow.
---

# Incrementally Adopting Next.js

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/rewrites">Rewrites</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/redirects">Redirects</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-zones">Multi-Zones</a></li>
  </ul>
</details>

Next.js has been designed for gradual adoption. With Next.js, you can continue using your existing code and add as much (or as little) React as you need. By starting small and incrementally adding more pages, you can prevent derailing feature work by avoiding a complete rewrite.

## Strategies

### Subpath

The first strategy is to configure your server or proxy such that, everything under a specific subpath points to a Next.js app. For example, your existing website might be at `example.com`, and you might configure your proxy such that `example.com/store` serves a Next.js e-commerce store.

Using [`basePath`](/docs/api-reference/next.config.js/basepath.md), you can configure your Next.js application's assets and links to automatically work with your new subpath `/store`. Since each page in Next.js is its own [standalone route](/docs/routing/introduction.md), pages like `pages/products.js` will route to `example.com/store/products` in your application.

```jsx
// next.config.js

module.exports = {
  basePath: '/store',
}
```

To learn more about `basePath`, take a look at our [documentation](/docs/api-reference/next.config.js/basepath.md).

### Rewrites

The second strategy is to create a new Next.js app that points to the root URL of your domain. Then, you can use [`rewrites`](/docs/api-reference/next.config.js/rewrites.md) inside `next.config.js` to have some subpaths to be proxied to your existing app.

For example, let's say you created a Next.js app to be served from `example.com` with the following `next.config.js`. Now, requests for the pages you’ve added to this Next.js app (e.g. `/about` if you’ve added `pages/about.js`) will be handled by Next.js, and requests for any other route (e.g. `/dashboard`) will be proxied to `proxy.example.com`.

> **Note:** If you use [fallback: true/'blocking'](/docs/api-reference/data-fetching/get-static-paths#fallback-true) in `getStaticPaths`, the catch-all fallback `rewrites` defined in `next.config.js` will not be run. They are instead caught by the `getStaticPaths` fallback.

```jsx
// next.config.js

module.exports = {
  async rewrites() {
    return {
      // After checking all Next.js pages (including dynamic routes)
      // and static files we proxy any other requests
      fallback: [
        {
          source: '/:path*',
          destination: `https://proxy.example.com/:path*`,
        },
      ],
    }

    // For versions of Next.js < v10.1 you can use a no-op rewrite instead
    return [
      // we need to define a no-op rewrite to trigger checking
      // all pages/static files before we attempt proxying
      {
        source: '/:path*',
        destination: '/:path*',
      },
      {
        source: '/:path*',
        destination: `https://proxy.example.com/:path*`,
      },
    ]
  },
}
```

To learn more about rewrites, take a look at our [documentation](/docs/api-reference/next.config.js/rewrites.md).

> **Note:** If you are incrementally migrating to a dynamic route (e.g. `[slug].js`) and using `fallback: true` or `fallback: 'blocking'` along with a fallback `rewrite`, ensure you consider the case where pages are not found. When Next.js matches the dynamic route it stops checking any further routes. Using `notFound: true` in `getStaticProps` will return the 404 page without applying the fallback `rewrite`. If this is not desired, you can use `getServerSideProps` with `stale-while-revalidate` Cache-Control headers when returning your props. Then, you can _manually_ proxy to your existing backend using something like [http-proxy](https://github.com/vercel/next.js/discussions/38839#discussioncomment-3744442) instead of returning `notFound: true`.

### Micro-Frontends with Monorepos and Subdomains

Next.js and [Vercel](https://vercel.com) make it straightforward to adopt micro frontends and deploy as a [monorepo](https://vercel.com/blog/monorepos-are-changing-how-teams-build-software?utm_source=next-site&utm_medium=docs&utm_campaign=next-website). This allows you to use [subdomains](https://demo.vercel.pub/platforms-starter-kit) to adopt new applications incrementally. Some benefits of micro-frontends:

- Smaller, more cohesive and maintainable codebases.
- More scalable organizations with decoupled, autonomous teams.
- The ability to upgrade, update, or even rewrite parts of the frontend in a more incremental fashion.

Once your monorepo is set up, push changes to your Git repository as usual and you'll see the commits deployed to the Vercel projects you've connected.

## Conclusion

To learn more, read about [subpaths](/docs/api-reference/next.config.js/basepath.md) and [rewrites](/docs/api-reference/next.config.js/rewrites.md) or [deploy a Next.js monorepo](https://vercel.com/templates/next.js/monorepo-turborepo).
