# Zustand example

This example shows how to integrate Zustand in Next.js with Server Components.

Usually splitting your app state into the `app` directory feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use Zustand that also works with the different Next.js's revalidation strategies.

In the first example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color (black) than the client one (grey).
This is given by the fact that the `revalidate` config is set to `0`.

To illustrate SSG, go to `/ssg` and to illustrate SSR go to `/`, those routes are using Next.js data fetching methods to get the date in the server.
The values in this page are fetched only at build time.
This is given by the fact that the `revalidate` config is set to `false`

The trick here for supporting universal Zustand is to separate the cases for the client and the server. When we are on the server we want to create a new store every time with the `initialZustandState` fetched on SSR.

All components have access to the Zustand store using `useStore()` returned `store.ts` file.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-zustand)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-zustand&project-name=with-zustand&repository-name=with-zustand)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-zustand with-zustand-app
```

````bash
yarn create next-app --example with-zustand with-zustand-app
```returned from the get\*Props methods.

```bash
pnpm create next-app --example with-zustand with-zustand-app
````

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
