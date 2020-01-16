# Next.js example with [`graphql-react`](https://github.com/jaydenseric/graphql-react)

[`graphql-react`](https://github.com/jaydenseric/graphql-react) is a [GraphQL](https://graphql.org) client for [React](https://reactjs.org) using modern [context](https://reactjs.org/docs/context) and [hooks](https://reactjs.org/docs/hooks-intro) APIs that is lightweight (&lt; 2.5 KB [size limited](https://github.com/ai/size-limit)) but powerful; the first [Relay](https://facebook.github.io/relay) and [Apollo](https://apollographql.com/docs/react) alternative with server side rendering.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-graphql-react)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-graphql-react with-graphql-react-app
# or
yarn create next-app --example with-graphql-react with-graphql-react-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-graphql-react
cd with-graphql-react
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

## Notes

- In `next.config.js` Next.js config is decorated using [`withGraphQLConfig`](https://github.com/jaydenseric/next-graphql-react#function-withgraphqlconfig) from [`next-graphql-react`](https://github.com/jaydenseric/next-graphql-react), to exclude specific [`graphql-react`](https://github.com/jaydenseric/graphql-react) and [`next-graphql-react`](https://github.com/jaydenseric/next-graphql-react) server only imports from the client bundle.
- In `pages/_app.js` a [custom `App` component](https://github.com/zeit/next.js#custom-app) is decorated with the [`withGraphQLApp`](https://github.com/jaydenseric/next-graphql-react/#function-withgraphqlapp) [higher-order component](https://reactjs.org/docs/higher-order-components) from [`next-graphql-react`](https://github.com/jaydenseric/next-graphql-react), generating a `graphql` prop that populates the [`GraphQLProvider`](https://github.com/jaydenseric/graphql-react#function-graphqlprovider) component from [`graphql-react`](https://github.com/jaydenseric/graphql-react).
- In `pages/index.js` the [`useGraphQL`](https://github.com/jaydenseric/graphql-react#function-usegraphql) React hook from [`graphql-react`](https://github.com/jaydenseric/graphql-react) is used to query the [GraphQL Pokémon API](https://github.com/lucasbento/graphql-pokemon) and show a picture of Pikachu.
