# With dynamic `App` layout example

Shows how to use `pages/_app.js` to implement _dynamic_ layouts for pages. This is achieved by attaching a static `Layout` property to each page that needs a different layout. In that way, once we use `pages/_app.js` to wrap our pages, we can get it from `Component.Layout` and render it accordingly.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-dynamic-app-layout&project-name=with-dynamic-app-layout&repository-name=with-dynamic-app-layout)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-dynamic-app-layout with-dynamic-app-layout-app
# or
yarn create next-app --example with-dynamic-app-layout with-dynamic-app-layout-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
