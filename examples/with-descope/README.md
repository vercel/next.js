# Descope and Next.js Example

This example shows how to use [Descope](https://docs.descope.com/build/guides/gettingstarted/?frontend=nextjs) with Next.js. The example features adding sign up, sign in, and an authenticated API route to your Next.js application.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-descope&env=NEXT_PUBLIC_DESCOPE_PROJECT_ID,DESCOPE_MANAGEMENT_KEY)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-descope
```

```bash
yarn create next-app --example with-descope
```

```bash
pnpm create next-app --example with-descope
```

To run the example locally you need to:

1. Sign up at [Descope](https://www.descope.com/sign-up).
2. Go to your [Project Settings](https://app.descope.com/settings/project) and fetch the Descope Project ID.
3. Create a Management Key, under [Company Settings](https://app.descope.com/settings/company/managementkeys) in the Descope Console.
4. Set the required Descope environment variables as shown at [the example env file](./.env.local.example).
5. `yarn` to install the required dependencies.
6. `yarn dev` to launch the development server.

## Learn More

To learn more about Descope and Next.js, take a look at the following resources:

- [Quick start](https://docs.descope.com/build/guides/gettingstarted/?frontend=nextjs)
- [Descope Documentation](https://docs.descope.com/) - learn about Descope features and our Next.js SDK.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
