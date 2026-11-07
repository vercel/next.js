# Redux-Observable Example

This example demonstrates how to use [redux-observable](https://redux-observable.js.org/) with Next.js, featuring proper server-side data fetching.

The page renders information about Star Wars characters from [SWAPI](https://swapi.dev/). The initial character is fetched on the server using `getServerSideProps`, ensuring the data is available in the HTML even with JavaScript disabled. After hydration, new characters are fetched every 3 seconds via redux-observable epics.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-redux-observable&project-name=with-redux-observable&repository-name=with-redux-observable)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-redux-observable with-redux-observable-app
```

```bash
yarn create next-app --example with-redux-observable with-redux-observable-app
```

```bash
pnpm create next-app --example with-redux-observable with-redux-observable-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

The key pattern for SSR with redux-observable:

1. Use `getServerSideProps` to fetch initial data on the server
2. Pass the fetched data as `initialReduxState` via props
3. Initialize the Redux store with the preloaded state in `_app.tsx`
4. On the client, epics handle subsequent data fetching (polling every 3 seconds)

This ensures the first character is always rendered server-side, fixing the issue where fields were empty when JavaScript was disabled.
