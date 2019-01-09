# Next.js example with [`graphql-react`](https://github.com/jaydenseric/graphql-react)

[`graphql-react`](https://github.com/jaydenseric/graphql-react) is a lightweight but powerful [GraphQL](https://graphql.org) client for React; the first [Relay](https://facebook.github.io/relay) and [Apollo](https://apollographql.com/docs/react) alternative with server side rendering.

See how it can be used in a Next.js app for GraphQL queries with server side rendering and client side data hydration:

- In `pages/_app.js` a [custom `App` component](https://github.com/zeit/next.js#custom-app) is decorated with the [`withGraphQL`](https://github.com/jaydenseric/next-graphql-react/#function-withgraphql) [higher-order component](https://reactjs.org/docs/higher-order-components) from [`next-graphql-react`](https://github.com/jaydenseric/next-graphql-react), generating a `graphql` prop that populates the [`Provider`](https://github.com/jaydenseric/graphql-react#function-provider) component from [`graphql-react`](https://github.com/jaydenseric/graphql-react).
- In `pages/index.js` the [`Query`](https://github.com/jaydenseric/graphql-react#function-query) component from [`graphql-react`](https://github.com/jaydenseric/graphql-react) is used to query the [GraphQL Pokémon API](https://github.com/lucasbento/graphql-pokemon) and show a picture of Pikachu.

## Setup

1. Download the example:

   ```sh
   curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-graphql-react
   ```

2. Change directory to it:

   ```sh
   cd with-graphql-react
   ```

3. Install it:

   ```sh
   npm install
   ```

4. Run it:

   ```sh
   npm run dev
   ```

## Deploy

[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-graphl-react)
