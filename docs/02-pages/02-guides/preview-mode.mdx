---
title: How to preview content with Preview Mode in Next.js
nav_title: Preview Mode
description: Next.js has the preview mode for statically generated pages. You can learn how it works here.
version: legacy
---

> **Note**: This feature is superseded by [Draft Mode](/docs/pages/guides/draft-mode).

<details>
  <summary>Examples</summary>

- [Agility CMS Example](https://github.com/vercel/next.js/tree/canary/examples/cms-agilitycms) ([Demo](https://next-blog-agilitycms.vercel.app/))
- [Builder.io Example](https://github.com/vercel/next.js/tree/canary/examples/cms-builder-io) ([Demo](https://cms-builder-io.vercel.app/))
- [ButterCMS Example](https://github.com/vercel/next.js/tree/canary/examples/cms-buttercms) ([Demo](https://next-blog-buttercms.vercel.app/))
- [Contentful Example](https://github.com/vercel/next.js/tree/canary/examples/cms-contentful) ([Demo](https://app-router-contentful.vercel.app/))
- [Cosmic Example](https://github.com/vercel/next.js/tree/canary/examples/cms-cosmic) ([Demo](https://next-blog-cosmic.vercel.app/))
- [DatoCMS Example](https://github.com/vercel/next.js/tree/canary/examples/cms-datocms) ([Demo](https://next-blog-datocms.vercel.app/))
- [DotCMS Example](https://github.com/vercel/next.js/tree/canary/examples/cms-dotcms) ([Demo](https://nextjs-dotcms-blog.vercel.app/))
- [Drupal Example](https://github.com/vercel/next.js/tree/canary/examples/cms-drupal) ([Demo](https://cms-drupal.vercel.app/))
- [Enterspeed Example](https://github.com/vercel/next.js/tree/canary/examples/cms-enterspeed) ([Demo](https://next-blog-demo.enterspeed.com/))
- [GraphCMS Example](https://github.com/vercel/next.js/tree/canary/examples/cms-graphcms) ([Demo](https://next-blog-graphcms.vercel.app/))
- [Keystone Example](https://github.com/vercel/next.js/tree/canary/examples/cms-keystonejs-embedded) ([Demo](https://nextjs-keystone-demo.vercel.app/))
- [Kontent.ai Example](https://github.com/vercel/next.js/tree/canary/examples/cms-kontent-ai) ([Demo](https://next-blog-kontent-ai.vercel.app/))
- [Makeswift Example](https://github.com/vercel/next.js/tree/canary/examples/cms-makeswift) ([Demo](https://nextjs-makeswift-example.vercel.app/))
- [Plasmic Example](https://github.com/vercel/next.js/tree/canary/examples/cms-plasmic) ([Demo](https://nextjs-plasmic-example.vercel.app/))
- [Prepr Example](https://github.com/vercel/next.js/tree/canary/examples/cms-prepr) ([Demo](https://next-blog-prepr.vercel.app/))
- [Prismic Example](https://github.com/vercel/next.js/tree/canary/examples/cms-prismic) ([Demo](https://next-blog-prismic.vercel.app/))
- [Sanity Example](https://github.com/vercel/next.js/tree/canary/examples/cms-sanity) ([Demo](https://next-blog.sanity.build/))
- [Sitecore XM Cloud Example](https://github.com/vercel/next.js/tree/canary/examples/cms-sitecore-xmcloud) ([Demo](https://vercel-sitecore-xmcloud-demo.vercel.app/))
- [Storyblok Example](https://github.com/vercel/next.js/tree/canary/examples/cms-storyblok) ([Demo](https://next-blog-storyblok.vercel.app/))
- [Strapi Example](https://github.com/vercel/next.js/tree/canary/examples/cms-strapi) ([Demo](https://next-blog-strapi.vercel.app/))
- [TakeShape Example](https://github.com/vercel/next.js/tree/canary/examples/cms-takeshape) ([Demo](https://next-blog-takeshape.vercel.app/))
- [Tina Example](https://github.com/vercel/next.js/tree/canary/examples/cms-tina) ([Demo](https://cms-tina-example.vercel.app/))
- [Umbraco Example](https://github.com/vercel/next.js/tree/canary/examples/cms-umbraco) ([Demo](https://nextjs-umbraco-sample-blog.vercel.app/))
- [Umbraco Heartcore Example](https://github.com/vercel/next.js/tree/canary/examples/cms-umbraco-heartcore) ([Demo](https://next-blog-umbraco-heartcore.vercel.app/))
- [Webiny Example](https://github.com/vercel/next.js/tree/canary/examples/cms-webiny) ([Demo](https://webiny-headlesscms-nextjs-example.vercel.app/))
- [WordPress Example](https://github.com/vercel/next.js/tree/canary/examples/cms-wordpress) ([Demo](https://next-blog-wordpress.vercel.app/))
- [Blog Starter Example](https://github.com/vercel/next.js/tree/canary/examples/blog-starter) ([Demo](https://next-blog-starter.vercel.app/))

</details>

In the [Pages documentation](/docs/pages/building-your-application/routing/pages-and-layouts) and the [Data Fetching documentation](/docs/pages/building-your-application/data-fetching), we talked about how to pre-render a page at build time (**Static Generation**) using `getStaticProps` and `getStaticPaths`.

Static Generation is useful when your pages fetch data from a headless CMS. However, it’s not ideal when you’re writing a draft on your headless CMS and want to **preview** the draft immediately on your page. You’d want Next.js to render these pages at **request time** instead of build time and fetch the draft content instead of the published content. You’d want Next.js to bypass Static Generation only for this specific case.

Next.js has a feature called **Preview Mode** which solves this problem. Here are instructions on how to use it.

## Step 1: Create and access a preview API route

> Take a look at the [API Routes documentation](/docs/pages/building-your-application/routing/api-routes) first if you’re not familiar with Next.js API Routes.

First, create a **preview API route**. It can have any name - e.g. `pages/api/preview.js` (or `.ts` if using TypeScript).

In this API route, you need to call `setPreviewData` on the response object. The argument for `setPreviewData` should be an object, and this can be used by `getStaticProps` (more on this later). For now, we’ll use `{}`.

```js
export default function handler(req, res) {
  // ...
  res.setPreviewData({})
  // ...
}
```

`res.setPreviewData` sets some **cookies** on the browser which turns on the preview mode. Any requests to Next.js containing these cookies will be considered as the **preview mode**, and the behavior for statically generated pages will change (more on this later).

You can test this manually by creating an API route like below and accessing it from your browser manually:

```js filename="pages/api/preview.js"
// simple example for testing it manually from your browser.
export default function handler(req, res) {
  res.setPreviewData({})
  res.end('Preview mode enabled')
}
```

If you open your browser’s developer tools and visit `/api/preview`, you’ll notice that the `__prerender_bypass` and `__next_preview_data` cookies will be set on this request.

### Securely accessing it from your Headless CMS

In practice, you’d want to call this API route _securely_ from your headless CMS. The specific steps will vary depending on which headless CMS you’re using, but here are some common steps you could take.

These steps assume that the headless CMS you’re using supports setting **custom preview URLs**. If it doesn’t, you can still use this method to secure your preview URLs, but you’ll need to construct and access the preview URL manually.

**First**, you should create a **secret token string** using a token generator of your choice. This secret will only be known by your Next.js app and your headless CMS. This secret prevents people who don’t have access to your CMS from accessing preview URLs.

**Second**, if your headless CMS supports setting custom preview URLs, specify the following as the preview URL. This assumes that your preview API route is located at `pages/api/preview.js`.

```bash filename="Terminal"
https://<your-site>/api/preview?secret=<token>&slug=<path>
```

- `<your-site>` should be your deployment domain.
- `<token>` should be replaced with the secret token you generated.
- `<path>` should be the path for the page that you want to preview. If you want to preview `/posts/foo`, then you should use `&slug=/posts/foo`.

Your headless CMS might allow you to include a variable in the preview URL so that `<path>` can be set dynamically based on the CMS’s data like so: `&slug=/posts/{entry.fields.slug}`

**Finally**, in the preview API route:

- Check that the secret matches and that the `slug` parameter exists (if not, the request should fail).
-
- Call `res.setPreviewData`.
- Then redirect the browser to the path specified by `slug`. (The following example uses a [307 redirect](https://developer.mozilla.org/docs/Web/HTTP/Status/307)).

```js
export default async (req, res) => {
  // Check the secret and next parameters
  // This secret should only be known to this API route and the CMS
  if (req.query.secret !== 'MY_SECRET_TOKEN' || !req.query.slug) {
    return res.status(401).json({ message: 'Invalid token' })
  }

  // Fetch the headless CMS to check if the provided `slug` exists
  // getPostBySlug would implement the required fetching logic to the headless CMS
  const post = await getPostBySlug(req.query.slug)

  // If the slug doesn't exist prevent preview mode from being enabled
  if (!post) {
    return res.status(401).json({ message: 'Invalid slug' })
  }

  // Enable Preview Mode by setting the cookies
  res.setPreviewData({})

  // Redirect to the path from the fetched post
  // We don't redirect to req.query.slug as that might lead to open redirect vulnerabilities
  res.redirect(post.slug)
}
```

If it succeeds, then the browser will be redirected to the path you want to preview with the preview mode cookies being set.

## Step 2: Update `getStaticProps`

The next step is to update `getStaticProps` to support the preview mode.

If you request a page which has `getStaticProps` with the preview mode cookies set (via `res.setPreviewData`), then `getStaticProps` will be called at **request time** (instead of at build time).

Furthermore, it will be called with a `context` object where:

- `context.preview` will be `true`.
- `context.previewData` will be the same as the argument used for `setPreviewData`.

```js
export async function getStaticProps(context) {
  // If you request this page with the preview mode cookies set:
  //
  // - context.preview will be true
  // - context.previewData will be the same as
  //   the argument used for `setPreviewData`.
}
```

We used `res.setPreviewData({})` in the preview API route, so `context.previewData` will be `{}`. You can use this to pass session information from the preview API route to `getStaticProps` if necessary.

If you’re also using `getStaticPaths`, then `context.params` will also be available.

### Fetch preview data

You can update `getStaticProps` to fetch different data based on `context.preview` and/or `context.previewData`.

For example, your headless CMS might have a different API endpoint for draft posts. If so, you can use `context.preview` to modify the API endpoint URL like below:

```js
export async function getStaticProps(context) {
  // If context.preview is true, append "/preview" to the API endpoint
  // to request draft data instead of published data. This will vary
  // based on which headless CMS you're using.
  const res = await fetch(`https://.../${context.preview ? 'preview' : ''}`)
  // ...
}
```

That’s it! If you access the preview API route (with `secret` and `slug`) from your headless CMS or manually, you should now be able to see the preview content. And if you update your draft without publishing, you should be able to preview the draft.

Set this as the preview URL on your headless CMS or access manually, and you should be able to see the preview.

```bash filename="Terminal"
https://<your-site>/api/preview?secret=<token>&slug=<path>
```

## More Details

> **Good to know**: during rendering `next/router` exposes an `isPreview` flag, see the [router object docs](/docs/pages/api-reference/functions/use-router#router-object) for more info.

### Specify the Preview Mode duration

`setPreviewData` takes an optional second parameter which should be an options object. It accepts the following keys:

- `maxAge`: Specifies the number (in seconds) for the preview session to last for.
- `path`: Specifies the path the cookie should be applied under. Defaults to `/` enabling preview mode for all paths.

```js
setPreviewData(data, {
  maxAge: 60 * 60, // The preview mode cookies expire in 1 hour
  path: '/about', // The preview mode cookies apply to paths with /about
})
```

### Clear the Preview Mode cookies

By default, no expiration date is set for Preview Mode cookies, so the preview session ends when the browser is closed.

To clear the Preview Mode cookies manually, create an API route that calls `clearPreviewData()`:

```js filename="pages/api/clear-preview-mode-cookies.js"
export default function handler(req, res) {
  res.clearPreviewData({})
}
```

Then, send a request to `/api/clear-preview-mode-cookies` to invoke the API Route. If calling this route using [`next/link`](/docs/pages/api-reference/components/link), you must pass `prefetch={false}` to prevent calling `clearPreviewData` during link prefetching.

If a path was specified in the `setPreviewData` call, you must pass the same path to `clearPreviewData`:

```js filename="pages/api/clear-preview-mode-cookies.js"
export default function handler(req, res) {
  const { path } = req.query

  res.clearPreviewData({ path })
}
```

### `previewData` size limits

You can pass an object to `setPreviewData` and have it be available in `getStaticProps`. However, because the data will be stored in a cookie, there’s a size limitation. Currently, preview data is limited to 2KB.

### Works with `getServerSideProps`

The preview mode works on `getServerSideProps` as well. It will also be available on the `context` object containing `preview` and `previewData`.

> **Good to know**: You shouldn't set the `Cache-Control` header when using Preview Mode because it cannot be bypassed. Instead, we recommend using [ISR](/docs/pages/guides/incremental-static-regeneration).

### Works with API Routes

API Routes will have access to `preview` and `previewData` under the request object. For example:

```js
export default function myApiRoute(req, res) {
  const isPreview = req.preview
  const previewData = req.previewData
  // ...
}
```

### Unique per `next build`

Both the bypass cookie value and the private key for encrypting the `previewData` change when `next build` is completed.
This ensures that the bypass cookie can’t be guessed.

> **Good to know**: To test Preview Mode locally over HTTP your browser will need to allow third-party cookies and local storage access.
