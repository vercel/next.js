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

Next.js has been designed from the start for gradual adoption. You can use as much (or as little) React as you need. By starting small and incrementally adding more pages, you can prevent derailing feature work by avoiding a complete rewrite.

## Strategies

### Subpath

If you need multiple applications on a single domain, you can take over an entire subpath. For example, you might deploy your Next.js e-commerce store at `acme.com/store`.

Using [`basePath`](/docs/api-reference/next.config.js/basepath.md), you can configure your Next.js application's assets and links to automatically work with your new subpath `/store`. Since each page in Next.js is its own [standalone route](/docs/routing/introduction.md), new files like `pages/products.js` will route to `acme.com/store/products` in your new application.

```jsx
// next.config.js

module.exports = {
  basePath: '/store',
}
```

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

### Rewrites

If you plan on fully migrating your domain to Next.js, you can use [`rewrites`](/docs/api-reference/next.config.js/rewrites.md) inside `next.config.js`. This allows you to check your new routes before falling back to proxying your existing website.

For example, let's say you took over `/about` with Next.js. When a request for `acme.com/about` hits your Next.js application, it will serve the new page. A request for any other route (e.g. `acme.com/dashboard`) will fall back and proxy the URL you specify.

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
        destination: `https://acme-proxy.com/:path*`,
      },
    ]
  },
}
```

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

### Micro-Frontends

Next.js and [Vercel](https://vercel.com) make it easy to adopt [micro-frontends](https://martinfowler.com/articles/micro-frontends.html) and deploy as a [Monorepo](https://vercel.com/blog/monorepos). This allows you to use [subdomains](https://en.wikipedia.org/wiki/Subdomain) to adopt new applications incrementally. Some benefits of micro-frontends:

- Smaller, more cohesive and maintainable codebases.
- More scalable organizations with decoupled, autonomous teams.
- The ability to upgrade, update, or even rewrite parts of the frontend in a more incremental fashion.

Once your monorepo is set up, push changes to your Git repository as usual and you'll see the commits deployed to the Vercel projects you've connected.

## Conclusion

To learn more, read about [subpaths](/docs/api-reference/next.config.js/basepath.md) and [rewrites](/docs/api-reference/next.config.js/rewrites.md) or [deploy an example with micro-frontends](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-zones).
