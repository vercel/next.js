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

With Next.js you can use multiple apps as a single app using it's multi-zones feature.
This is an example showing how to use it.

In this example, we've two apps: 'home' and 'blog'. We'll start both apps with [Now](https://zeit.co/now):
We also have a set of builders and routes defined in `now.json`.

```bash
now dev
```

Now you can visit http://localhost:3000 and develop for both apps as a single app.

### Now config

`now.json` allows us to create a single dev server for any builders and routes we add to it, with `now dev` we can easily create a dev server for multiple apps without having to deploy or setup anything else:

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
    { "src": "/blog", "dest": "blog/blog" },
    { "src": "(.*)", "dest": "home$1" }
  ]
}
```

The previous file is based in the [@now/next](https://zeit.co/docs/v2/deployments/official-builders/next-js-now-next/) builder and [Now Routes](https://zeit.co/docs/v2/deployments/routes/) from Now V2.

## Special Notes

- All pages should be unique across zones. A page with the same name should not exist in multiple zones. Otherwise, there'll be unexpected behaviours in client side navigation.
  - According to the above example, a page named `blog` should not be exist in the `home` zone.

## Production Deployment

We only need to run `now`, the same `now.json` used for development will be used for the deployment:

```bash
now
```
