# Create blog using Voidfull & Next.JS

This example allows you to create a statically generated blogging site using [Voidfull](https://voidfull.com?utm_source=nextjs-gh-repo) and Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-voidfull&project-name=cms-voidfull&repository-name=cms-voidfull)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example cms-voidfull cms-voidfull-app
```

```bash
yarn create next-app --example cms-voidfull cms-voidfull-app
```

```bash
pnpm create next-app --example cms-voidfull cms-voidfull-app
```

```bash
bunx create-next-app --example cms-voidfull cms-voidfull-app
```

## Getting started

To get started you'll need to update two environment variables: `NEXT_PUBLIC_VOIDFULL_SITE_ID` and `NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN`.

1. Create an account
   Sign up at [voidfull.com](https://voidfull.com?utm_source=nextjs-gh-repo) if you don't have an account yet.
2. Create site in the team
   Once logged in, create a new site. After the site is created, open it.
3. Update `NEXT_PUBLIC_VOIDFULL_SITE_ID` env
   In your site's URL, locate the Site ID and copy it. Then, set the `NEXT_PUBLIC_VOIDFULL_SITE_ID` environment variable in your project to this value.
4. Generate a Content Token
   From the sidebar, go to the "Tokens" section. Create a new token by specifying a name for it.
   5.Update `NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN` env
   Copy the newly generated token and set it as the value for the `NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN` environment variable in your project.
5. `npm install` to install the required dependencies.
6. `npm run dev` to launch the development server.

## Learn More

To learn more about Voidfull and Next.js, take a look at the following resources:

- [Voidfull JS-SDK](https://www.npmjs.com/package/@voidfull/js-sdk)
- [Voidfull Website](https://voidfull.com?utm_source=nextjs-gh-repo) - learn about Voidfull features.
