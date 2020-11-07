---
description: A custom asset prefix allows you serve static assets from a CDN. Learn more about it here.
---

# CDN Support with Asset Prefix

> **Attention**: [Deploying to Vercel](/docs/deployment.md) automatically configures a global CDN for your Next.js project.
> You do not need to manually setup an Asset Prefix.

> **Note**: Next.js 9.5+ added support for a customizable [Base Path](/docs/api-reference/next.config.js/basepath.md), which is better
> suited for hosting your application on a sub-path like `/docs`.
> We do not suggest you use a custom Asset Prefix for this use case.

To set up a [CDN](https://en.wikipedia.org/wiki/Content_delivery_network), you can set up an asset prefix and configure your CDN's origin to resolve to the domain that Next.js is hosted on.

Open `next.config.js` and add the `assetPrefix` config:

```js
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  // Use the CDN in production and localhost for development.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : '',
}
```

Next.js will automatically use your asset prefix for the JavaScript and CSS files it loads from the `/_next/` path (`.next/static/` folder).

Asset prefix support does not influence the following paths:

- Files in the [public](/docs/basic-features/static-file-serving.md) folder; if you want to serve those assets over a CDN, you'll have to introduce the prefix yourself
- `/_next/data/` requests for `getServerSideProps` pages. These requests will always be made against the main domain since they're not static.
- `/_next/data/` requests for `getStaticProps` pages. These requests will always be made against the main domain to support [Incremental Static Generation](/docs/basic-features/data-fetching.md#incremental-static-regeneration), even if you're not using it (for consistency).

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/static-file-serving.md">
    <b>Static File Serving:</b>
    <small>Serve static files, like images, in the public directory.</small>
  </a>
</div>
