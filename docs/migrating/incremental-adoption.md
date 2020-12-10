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

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

### Rewrites

The second strategy is to create a new Next.js app that points to the root URL of your domain. Then, you can use [`rewrites`](/docs/api-reference/next.config.js/rewrites.md) inside `next.config.js` to have some subpaths to be proxied to your existing app.

For example, let's say you created a Next.js app to be served from `example.com` with the following `next.config.js`. Now, requests for the pages you’ve added to this Next.js app (e.g. `/about` if you’ve added `pages/about.js`) will be handled by Next.js, and requests for any other route (e.g. `/dashboard`) will be proxied to `proxy.example.com`.

```jsx
// next.config.js

module.exports = {
  async rewrites() {
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

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

### Micro-Frontends with Monorepos and Subdomains

Next.js and [Vercel](https://vercel.com) make it easy to adopt [micro-frontends](https://martinfowler.com/articles/micro-frontends.html) and deploy as a [Monorepo](https://vercel.com/blog/monorepos). This allows you to use [subdomains](https://en.wikipedia.org/wiki/Subdomain) to adopt new applications incrementally. Some benefits of micro-frontends:

- Smaller, more cohesive and maintainable codebases.
- More scalable organizations with decoupled, autonomous teams.
- The ability to upgrade, update, or even rewrite parts of the frontend in a more incremental fashion.

Once your monorepo is set up, push changes to your Git repository as usual and you'll see the commits deployed to the Vercel projects you've connected.

## Conclusion

To learn more, read about [subpaths](/docs/api-reference/next.config.js/basepath.md) and [rewrites](/docs/api-reference/next.config.js/rewrites.md) or [deploy an example with micro-frontends](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-zones).
