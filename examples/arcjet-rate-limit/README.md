# Arcjet Rate Limit Example

‼️ This example is [for the Next.js
repo](https://github.com/vercel/next.js/blob/canary/contributing/examples/adding-examples.md).

This example uses the [Arcjet](https://arcjet.com/) SDK to implement a token
bucket rate limit for API routes. It does not require any additional
infrastructure e.g. Redis.

The Arcjet SDK allows you to Implement rate limiting, bot protection, email
verification & defend against common attacks. See [the
docs](https://docs.arcjet.com/) for details.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/arcjet-rate-limit&project-name=arcjet-rate-limit&repository-name=arcjet-rate-limit)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example arcjet-rate-limit arcjet-rate-limit-app
```

```bash
yarn create next-app --example arcjet-rate-limit arcjet-rate-limit-app
```

```bash
pnpm create next-app --example arcjet-rate-limit arcjet-rate-limit-app
```

```bash
bunx create-next-app --example arcjet-rate-limit arcjet-rate-limit-app
```

To run the example you need to:

1. [Create a free Arcjet account](https://app.arcjet.com/) then follow the
   instructions to add a site and get a key.
2. Rename `.env.local.example` to `.env.local` and add your Arcjet key.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
