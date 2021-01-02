# Fleur example

This example shows how to integrate Fleur(@fleur/fleur) in Next.js.

Fleur is an Flux framework inspired of Fluxible / Redux with modern React API.
Cool type inferencibity, better testability, tuned perfomance and less re-rendering, to gives more productivity to you.

See API Oveview in [Fleur's README](https://github.com/fleur-js/fleur/tree/main/packages/fleur). It's great.

---

Fleur is similar to Redux. Applications are developed in four layers: Operation, Action, Store, and Component.

Although each layer is separated, they work together stably through TypeScript's type inference.

Since types are guaranteed by inference as much as possible, there is less code that needs to be written for type safety. The amount of typedef code required for Fleur would not be much different from the minimum amount of typedef code required for application safety.

In this example, the global state of the application is managed by Fleur, and the code supports fetching data from the API via `getServerSideProps`, `getStaticProps`, and `getInitialProps` in Next.js.

This example uses Fleur to manage the global state of the application, and displays a digital clock that is updated every second.

The Operation is running with an async function. If you need to fetch data from the API, you can do so in the Operation, dispatch the action to the Store, and read it from the component via the `useStore` hooks.

Fleur supports `getServerSideProps`, `getStaticProps`, and `getInitialProps` from Next.js, and also supports data fetching from these callbacks.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-redux)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-fleur your-app-name
# or
yarn create next-app --example with-fleur your-app-name
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
