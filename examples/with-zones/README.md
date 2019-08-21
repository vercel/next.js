# Using multiple zones

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-zones with-zones-app
# or
yarn create next-app --example with-zones with-zones-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-zones
cd with-zones
```

## The idea behind this example

With Next.js you can combine multiple apps to a single one using its [multi-zones feature](https://nextjs.org/docs#multi-zones). In this example, we have two apps, 'home' and 'blog', that can be started separately via `next dev` but also together, behind a proxy, for which we'll use [ZEIT Now](https://zeit.co/now).

First, let's start the blog app separately:

```bash
cd blog
yarn
yarn dev
```

On <http://localhost:4000>, you can browse routes like `/blog` and `/blog/post/1` (dynamic routing) but **not** `/about` from the 'home' app.

To run the apps as zones within a single deployment, go back to the example root and run:

```bash
now dev
```

When you now browse <http://localhost:3000>, you'll see that routes from both 'home' and 'blog' are available.

## Now configuration

`now.json` looks like this:

```json
{
  "name": "with-zones",
  "version": 2,
  "builds": [
    { "src": "blog/next.config.js", "use": "@now/next" },
    { "src": "home/next.config.js", "use": "@now/next" }
  ],
  "routes": [
    { "src": "/blog/_next(.*)", "dest": "blog/_next$1" },
    { "src": "/blog(.*)", "dest": "blog/blog$1" },
    { "src": "(.*)", "dest": "home$1" }
  ]
}
```

Note how for 'blog', we need two separate routing rules:

- `/blog/_next/...` should be treated literally as it's not subject to Next.js routing (we've set `/blog` as an asset prefix, see below).
- `/blog/post/1` should be treated as if it was `/blog/blog/post/1` – the first "blog" determines the app while the rest is a route for Next.js' router.

The 'home' app runs from a root so a single "catch all" rule is enough.

## Next.js configuration

From the point of view of the application code, nothing changes with multi-zones. Specifically, remember that there is no routing magic done by the feature: if you want a route like `/blog/post/1`, the page component must be in `pages/blog/post/[id].js`.

On the config side, we need assets to be available at `/blog/_next/...`, not `/_next/...`, so we set [`assetPrefix`](https://nextjs.org/docs#cdn-support-with-asset-prefix) in `next.config.js`:

```js
module.exports = {
  target: 'serverless',
  assetPrefix: '/blog',
}
```

This would be enough if we just wanted to run the app on Now or `now dev` but as we also want to support the `next dev` scenario, we'll set asset prefix dynamically. First, we'll define a helper environment variable in `now.json`:

```json
{
  "build": {
    "env": {
      "BUILDING_FOR_NOW": "true"
    }
  }
}
```

Then in `next.config.js`, we can do this:

```js
module.exports = {
  target: 'serverless',
  assetPrefix: process.env.BUILDING_FOR_NOW ? '/blog' : '',
}
```

## Making `/static` assets work

The 'home' app runs from a root and can do simply this:

```jsx
<img src='/static/nextjs.png' />
```

However, the 'blog' app needs to use an URL like `/blog/static/image.png` and `assetPrefix` does **not** automatically prefix `src` (how could it, right?). So we need to prefix it manually like this:

```jsx
<img src={`${assetPrefix}/static/nextjs.png`} />
```

The question is where to get `assetPrefix` and the answer is to pass it down from `next.config.js` as an environment variable (that is inlined by webpack during build so that it's also available on the client-side).

Let's update our `next.config.js` to this:

```js
const assetPrefix = process.env.BUILDING_FOR_NOW ? '/blog' : ''

module.exports = {
  target: 'serverless',
  assetPrefix,
  env: {
    ASSET_PREFIX: assetPrefix
  }
}
```

Then in a React component, we can do this:

```jsx
<img src={`${process.env.ASSET_PREFIX}/static/nextjs.png`} />
```

## Production Deployment

Just run:

```bash
now
```
