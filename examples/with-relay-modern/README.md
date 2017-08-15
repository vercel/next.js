[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-relay-modern)
# Relay Modern Example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-relay-modern
cd with-relay-modern
```

Install it:

```bash
npm install
```

Download schema introspection data from configured Relay endpoint 

```bash
npm run schema
```

Run Relay ahead-of-time compilation (should be re-run after any edits to components that query data with Relay)
```bash
npm run relay
```

Run the project
```bash
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

[Relay Modern](https://facebook.github.io/relay/docs/relay-modern.html) is a new version of Relay designed from the ground up to be easier to use, more extensible and, most of all, able to improve performance on mobile devices. Relay Modern accomplishes this with static queries and ahead-of-time code generation.

In this simple example, we integrate Relay Modern seamlessly with Next by wrapping our *pages* inside a [higher-order component (HOC)](https://facebook.github.io/react/docs/higher-order-components.html). Using the HOC pattern we're able to pass down a query result data created by Relay into our React component hierarchy defined inside each page of our Next application. The HOC takes `options` argument that allows to specify a `query` that will be executed on the server when a page is being loaded. 

This example relies on [graph.cool](https://www.graph.cool) for its GraphQL backend.
