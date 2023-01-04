# Clerk and Next.js Example

This example shows how to use [Clerk](https://www.clerk.dev/?utm_source=github&utm_medium=nextjs-examples&utm_campaign=nextjs) with Next.js. The example features adding sign up, sign in, profile management, and an authenticated API route to your Next.js application.

## Demo

A hosted demo of this example is available at [clerk-nextjs-example.vercel.app](https://clerk-nextjs-example.vercel.app)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/clerkinc/clerk-nextjs-starter&integration-ids=oac_7uYNbc9CdDAZmNqbt3LEkO3a)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-clerk with-clerk-app
```

```bash
yarn create next-app --example with-clerk with-clerk-app
```

```bash
pnpm create next-app --example with-clerk with-clerk-app
```

To run the example locally you need to:

1. Sign up at [Clerk.dev](https://www.clerk.dev/?utm_source=github&utm_medium=starter_repos&utm_campaign=nextjs_starter).
2. Go to [Clerk's dashboard](https://dashboard.clerk.dev/?utm_source=github&utm_medium=starter_repos&utm_campaign=nextjs_starter) and create an application.
3. Set the required Clerk environment variables from your Clerk project as shown at [the example env file](./.env.local.example).
4. `yarn` to install the required dependencies.
5. `yarn dev` to launch the development server.

## Learn More

To learn more about Clerk.dev and Next.js, take a look at the following resources:

- [Quick start](https://docs.clerk.dev/get-started/nextjs)
- [Clerk.dev Documentation](https://docs.clerk.dev/) - learn about Clerk.dev features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
