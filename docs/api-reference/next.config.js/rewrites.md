---
description: Add rewrites to your Next.js app.
---

# Rewrites

Rewrites allow you to map an incoming request path to a different destination path.

Rewrites are only available on the Node.js environment and do not affect client-side routing.

To use rewrites you can use the `rewrites` key in `next.config.js`:

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/about',
        destination: '/',
      },
    ]
  },
}
```

`rewrites` is an async function that expects an array to be returned holding objects with `source` and `destination` properties:

- `source` is the incoming request path pattern.
- `destination` is the path you want to route to.

## Path Matching

Path matches are allowed, for example `/blog/:slug` will match `/blog/hello-world` (no nested paths):

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/blog/:slug',
        destination: '/news/:slug', // Matched parameters can be used in the destination
      },
    ]
  },
}
```

### Wildcard Path Matching

To match a wildcard path you can use `*` after a parameter, for example `/blog/:slug*` will match `/blog/a/b/c/d/hello-world`:

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/blog/:slug*',
        destination: '/news/:slug*', // Matched parameters can be used in the destination
      },
    ]
  },
}
```

## Rewriting to an external URL

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/custom-routes-proxying">Incremental adoption of Next.js</a></li>
  </ul>
</details>

Rewrites allow you to rewrite to an external url. This is especially useful for incrementally adopting Next.js.

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/blog/:slug',
        destination: 'https://example.com/blog/:slug', // Matched parameters can be used in the destination
      },
    ]
  },
}
```

### Incremental adoption of Next.js

You can also make Next.js check the application routes before falling back to proxying to the previous website.

This way you don't have to change the rewrites configuration when migrating more pages to Next.js

```js
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
        destination: `https://custom-routes-proxying-endpoint.vercel.app/:path*`,
      },
    ]
  },
}
```
