# Tesfy Example

[Tesfy](https://tesfy.io/) allows you to create **unlimited** A/B Tests and Feature Flags for **free** using a [web app](https://app.tesfy.io/) or by your self.

This example shows how to integrate [react-tesfy](https://github.com/andresz1/react-tesfy) in Next.js.

To use Tesfy there are only two mandatory things needed. A `userId` and a configuration file known as `datafile`. In the `_app.js` you will notice that those are being get.

The `userId` must uniquely identify a user even if not logged in, for that reason a [uuid](https://en.wikipedia.org/wiki/Universally_unique_identifier) is created and stored in a cookie so the next time a page is requested a new `userId` won't be created, instead the cookie one will be used.

The `datafile` is just a `json` that defines the configuration of the experiments and features available. It must be fetched from Tesfy CDN or from your own servers at least everytime a request is performed, later on this configuration could also be fetched if wanted (e.g. during page transitions).

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-tesfy)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-tesfy&project-name=with-tesfy&repository-name=with-tesfy)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-tesfy with-tesfy-app
# or
yarn create next-app --example with-tesfy with-tesfy-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
