[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-algolia-react-instantsearch)

# With Algolia React InstantSearch example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
# or
yarn create next-app --example with-algolia-react-instantsearch with-algolia-react-instantsearch-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-algolia-react-instantsearch
cd with-algolia-react-instantsearch
```

Set up Algolia:
- create an [algolia](https://www.algolia.com/) account or use this already [configured index](https://community.algolia.com/react-instantsearch/Getting_started.html#before-we-start)
- update the appId, apikey and indexName you want to search on in components/app.js

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example
The goal of this example is to illustrate how you can use [Algolia React InstantSearch](https://community.algolia.com/react-instantsearch/) to perform
your search with a Server-rendered application developed with Next.js. It also illustrates how you
can keep in sync the Url with the search.
