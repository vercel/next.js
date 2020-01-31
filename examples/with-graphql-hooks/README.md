# GraphQL Hooks Example

[GraphQL Hooks](https://github.com/nearform/graphql-hooks) is a library from NearForm that intends to be a minimal hooks-first GraphQL client. Providing a similar API to Apollo.

You'll see this shares the same [graph.cool](https://www.graph.cool) backend as the Apollo example, this is so you can compare the two side by side. The app itself should also look identical.

This started life as a copy of the `with-apollo` example. We then stripped out Apollo and replaced it with `graphql-hooks`. This was mostly as an exercise in ensuring basic functionality could be achieved in a similar way to Apollo. The [bundle size](https://bundlephobia.com/result?p=graphql-hooks@3.2.1) of `graphql-hooks` is tiny in comparison to Apollo and should cover a fair amount of use cases.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-graphql-hooks)

_Live Example: https://next-with-graphql-hooks.now.sh_

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-graphql-hooks with-graphql-hooks-app
# or
yarn create next-app --example with-graphql-hooks with-graphql-hooks-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-graphql-hooks
cd with-graphql-hooks
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
