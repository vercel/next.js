# With Algolia React InstantSearch example

The goal of this example is to illustrate how you can use [Algolia React InstantSearch](https://community.algolia.com/react-instantsearch/) to perform your search in an application developed with Next.js. It also illustrates how you can keep in sync the Url with the search.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
# or
yarn create next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

To set up Algolia:

- create an [algolia](https://www.algolia.com/) account or use this already [configured index](https://community.algolia.com/react-instantsearch/Getting_started.html#before-we-start)
- update the `appId`, `apikey` and `indexName` you want to search on in [`components/instantsearch.js`](components/instantsearch.js)

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
