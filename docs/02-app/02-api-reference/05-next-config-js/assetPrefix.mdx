---
title: assetPrefix
description: Learn how to use the assetPrefix config option to configure your CDN.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

<AppOnly>

> **Attention**: [Deploying to Vercel](/docs/app/building-your-application/deploying) automatically configures a global CDN for your Next.js project.
> You do not need to manually setup an Asset Prefix.

</AppOnly>

<PagesOnly>

> **Attention**: [Deploying to Vercel](/docs/pages/building-your-application/deploying) automatically configures a global CDN for your Next.js project.
> You do not need to manually setup an Asset Prefix.

</PagesOnly>

> **Good to know**: Next.js 9.5+ added support for a customizable [Base Path](/docs/app/api-reference/next-config-js/basePath), which is better
> suited for hosting your application on a sub-path like `/docs`.
> We do not suggest you use a custom Asset Prefix for this use case.

To set up a [CDN](https://en.wikipedia.org/wiki/Content_delivery_network), you can set up an asset prefix and configure your CDN's origin to resolve to the domain that Next.js is hosted on.

Open `next.config.js` and add the `assetPrefix` config:

```js filename="next.config.js"
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  // Use the CDN in production and localhost for development.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : undefined,
}
```

Next.js will automatically use your asset prefix for the JavaScript and CSS files it loads from the `/_next/` path (`.next/static/` folder). For example, with the above configuration, the following request for a JS chunk:

```
/_next/static/chunks/4b9b41aaa062cbbfeff4add70f256968c51ece5d.4d708494b3aed70c04f0.js
```

Would instead become:

```
https://cdn.mydomain.com/_next/static/chunks/4b9b41aaa062cbbfeff4add70f256968c51ece5d.4d708494b3aed70c04f0.js
```

The exact configuration for uploading your files to a given CDN will depend on your CDN of choice. The only folder you need to host on your CDN is the contents of `.next/static/`, which should be uploaded as `_next/static/` as the above URL request indicates. **Do not upload the rest of your `.next/` folder**, as you should not expose your server code and other configuration to the public.

While `assetPrefix` covers requests to `_next/static`, it does not influence the following paths:

<AppOnly>

- Files in the [public](/docs/app/building-your-application/optimizing/static-assets) folder; if you want to serve those assets over a CDN, you'll have to introduce the prefix yourself

</AppOnly>

<PagesOnly>

- Files in the [public](/docs/pages/building-your-application/optimizing/static-assets) folder; if you want to serve those assets over a CDN, you'll have to introduce the prefix yourself
- `/_next/data/` requests for `getServerSideProps` pages. These requests will always be made against the main domain since they're not static.
- `/_next/data/` requests for `getStaticProps` pages. These requests will always be made against the main domain to support [Incremental Static Generation](/docs/pages/building-your-application/data-fetching/incremental-static-regeneration), even if you're not using it (for consistency).

</PagesOnly>
