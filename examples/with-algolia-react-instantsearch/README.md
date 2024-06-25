# With Algolia React InstantSearch example

The goal of this example is to illustrate how you can use [Algolia React InstantSearch](https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/react/) to perform your search in an application developed with Next.js. It also illustrates how you can keep in sync the Url with the search.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-algolia-react-instantsearch&project-name=with-algolia-react-instantsearch&repository-name=with-algolia-react-instantsearch)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

```bash
yarn create next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

```bash
pnpm create next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

```bash
bun create next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

This example is already configured with an e-commerce index, but you can easily customize it by:

- [creating an Algolia account](https://www.algolia.com/doc/guides/getting-started/quick-start/#sign-up-for-an-algolia-account),
- [indexing your data](https://www.algolia.com/doc/guides/sending-and-managing-data/send-and-update-your-data/#index-your-data-without-coding),
- and updating the `APP_ID`, `API_KEY` and `INDEX_NAME` you want to search on in [`components/Search.tsx`](components/Search.tsx)

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
