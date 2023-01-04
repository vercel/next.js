# An example app with FingerprintJS Pro

This example shows how to identify visitors using [FingerprintJS Pro](https://fingerprintjs.com/) with Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-fingerprintjs-pro&project-name=with-fingerprintjs-pro&repository-name=with-fingerprintjs-pro)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-fingerprintjs-pro with-fingerprintjs-pro-app
```

```bash
yarn create next-app --example with-fingerprintjs-pro with-fingerprintjs-pro-app
```

```bash
pnpm create next-app --example with-fingerprintjs-pro with-fingerprintjs-pro-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

### API key

To identify visitors, you'll need a FingerprintJS Pro account (you can [sign up for free](https://dashboard.fingerprintjs.com/signup/)).
You can learn more about API keys in the [official FingerprintJS Pro documentation](https://dev.fingerprintjs.com/docs/quick-start-guide).

Once you get public key, you need to set up the API key in the environment variable `NEXT_PUBLIC_FPJS_PUBLIC_API_KEY`.
