# Passport.js Example

This example show how to use [Passport.js](http://www.passportjs.org) with Next.js. The example features cookie based authentication with username and password.

The example shows how to do a login, signup and logout; and to get the user info using a hook with [SWR](https://swr.vercel.app).

A database is not included. You can use any database you want and add it [in this file](lib/user.js).

The login cookie is httpOnly, meaning it can only be accessed by the API, and it's encrypted using [@hapi/iron](https://hapi.dev/family/iron) for more security.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-passport)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-passport&project-name=with-passport&repository-name=with-passport)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-passport with-passport-app
```

```bash
yarn create next-app --example with-passport with-passport-app
```

```bash
pnpm create next-app --example with-passport with-passport-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
