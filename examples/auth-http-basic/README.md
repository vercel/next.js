# Auth Http Basic

The example shows a simple way of how to add http basic auth (RFC 7235) to your Next.js application.

Upon successful authentication, a user is directed to the page they requested. Otherwise, they are either prompted to retry entering their credentials, or sent to a 401 plain text page if the prompt is cancelled.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example auth-http-basic auth-http-basic-app
```

```bash
yarn create next-app --example auth-http-basic auth-http-basic-app
```

```bash
pnpm create next-app --example auth-http-basic auth-http-basic-app
```

# Set up environment variables

To set the username and password to compare the values to, copy the .env.local.example file in this directory to .env.local (which will be ignored by Git):

```
cp .env.local.example .env.local
```

Then, open .env.local and add the missing environment variables.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
