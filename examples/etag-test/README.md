# Welcome to Next.js


This example demonstrates the differences in ETag behavior between Next.js 14 and 15 for static pre-rendered pages. It showcases how caching mechanisms have changed, particularly how ETags are generated and handled for static content, which affects browser caching and content revalidation.


## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/etag-test&project-name=etag-test&repository-name=etag-test)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:
npx create-next-app --example etag-test etag-test-app
```bash
npx create-next-app --example hello-world hello-world-app
```

```bash
yarn create next-app --example hello-world hello-world-app
```

```bash
pnpm create next-app --example etag-test etag-test-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
