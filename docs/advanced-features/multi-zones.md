# Multi Zones

<details>
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

There are no special zones related APIs. You only need to do following:

- Make sure to keep only the pages you need in your app, meaning that an app can't have pages from another app, if app `A` has `/blog` then app `B` shouldn't have it too.
- Make sure to add an [assetPrefix](/docs/api-reference/next.config.js/cdn-support-with-asset-prefix.md) to avoid conflicts with static files.

## How to merge zones

You can merge zones using any HTTP proxy.

For [Vercel](https://vercel.com/), you can use a single `vercel.json` to deploy both apps. It allows you to define routing routes for multiple apps like below:

```json
{
  "version": 2,
  "builds": [
    { "src": "blog/package.json", "use": "@now/next" },
    { "src": "home/package.json", "use": "@now/next" }
  ],
  "routes": [
    { "src": "/blog/_next(.*)", "dest": "blog/_next$1" },
    { "src": "/blog(.*)", "dest": "blog/blog$1" },
    { "src": "(.*)", "dest": "home$1" }
  ]
}
```

You can also configure a proxy server to route using a set of routes like the ones above, e.g deploy the blog app to `https://blog.example.com` and the home app to `https://home.example.com` and then add a proxy server for both apps in `https://example.com`.
