# Example app with strict CSP generating script hash

This example features how you can set up a strict CSP for your pages including Next.js' inline bootstrap script by hash.
It defines the CSP by document `meta` tag.

Note: There are still valid cases for using a nonce in case you need to inline scripts or styles for which calculating a hash is not feasible.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-strict-csp-hash)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-strict-csp-hash with-strict-csp-hash-app
# or
yarn create next-app --example with-strict-csp-hash with-strict-csp-hash-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
