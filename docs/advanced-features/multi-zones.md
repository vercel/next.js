# Multi Zones

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-zones">With Zones</a></li>
  </ul>
</details>

A zone is a single deployment of a Next.js app. You can have multiple zones and merge them as a single app.

For example, let's say you have the following apps:

- An app for serving `/blog/**`
- Another app for serving all other pages

With multi zones support, you can merge both these apps into a single one allowing your customers to browse it using a single URL, but you can develop and deploy both apps independently.

## How to define a zone

There are no zone related APIs. You only need to do following:

- Make sure to keep only the pages you need in your app, meaning that an app can't have pages from another app, if app `A` has `/blog` then app `B` shouldn't have it too.
- Make sure to configure a [basePath](/docs/api-reference/next.config.js/basepath.md) to avoid conflicts with pages and static files.

## How to merge zones

You can merge zones using [Rewrites](/docs/api-reference/next.config.js/rewrites.md) in one of the apps or any HTTP proxy.

For [Vercel](https://vercel.com/), you can use a [monorepo](https://vercel.com/blog/monorepos) to deploy both apps. Check the [Monorepos blog post](https://vercel.com/blog/monorepos) for more details on how it works and our [`with-zones` example](https://github.com/vercel/next.js/tree/canary/examples/with-zones) for a detailed guide using multiple Next.js applications.
