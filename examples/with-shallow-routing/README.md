# Shallow Routing Example

With [Shallow Routing](https://nextjs.org/docs/routing/shallow-routing), we can change the URL without running data fetching methods (like `getStaticProps` and `getServerSideProps`) again.

We do this by passing the `shallow: true` option to `Router.push` or `Router.replace`.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-shallow-routing)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-shallow-routing with-shallow-routing-app
# or
yarn create next-app --example with-shallow-routing with-shallow-routing-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
