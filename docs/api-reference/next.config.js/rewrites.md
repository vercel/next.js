---
description: Add rewrites to your Next.js app.
---

# Rewrites

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/rewrites">Rewrites</a></li>
  </ul>
</details>

Rewrites allow you to map an incoming request path to a different destination path.

Rewrites are only available on the Node.js environment and do not affect client-side routing.

Rewrites are not able to override public files or routes in the pages directory as these have higher priority than rewrites. For example, if you have `pages/index.js` you are not able to rewrite `/` to another location unless you rename the `pages/index.js` file.

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

### Regex Path Matching

To match a regex path you can wrap the regex in parenthesis after a parameter, for example `/blog/:slug(\\d{1,})` will match `/blog/123` but not `/blog/abc`:

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/old-blog/:post(\\d{1,})',
        destination: '/blog/:post', // Matched parameters can be used in the destination
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

### Rewrites with basePath support

When leveraging [`basePath` support](/docs/api-reference/next.config.js/basepath.md) with rewrites each `source` and `destination` is automatically prefixed with the `basePath` unless you add `basePath: false` to the rewrite:

```js
module.exports = {
  basePath: '/docs',

  async rewrites() {
    return [
      {
        source: '/with-basePath', // automatically becomes /docs/with-basePath
        destination: '/another', // automatically becomes /docs/another
      },
      {
        // does not add /docs since basePath: false is set
        source: '/without-basePath',
        destination: '/another',
        basePath: false,
      },
    ]
  },
}
```

### Rewrites with i18n support

When leveraging [`i18n` support](/docs/advanced-features/i18n-routing.md) with rewrites each `source` and `destination` is automatically prefixed to handle the configured `locales` unless you add `locale: false` to the rewrite:

```js
module.exports = {
  i18n: {
    locales: ['en', 'fr', 'de'],
    defaultLocale: 'en',
  },

  async rewrites() {
    return [
      {
        source: '/with-locale', // automatically handles all locales
        destination: '/another', // automatically passes the locale on
      },
      {
        // does not handle locales automatically since locale: false is set
        source: '/nl/with-locale-manual',
        destination: '/nl/another',
        locale: false,
      },
    ]
  },
}
```
