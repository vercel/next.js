[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-refnux)

# Refnux example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-refnux with-refnux-app
# or
yarn create next-app --example with-refnux with-refnux-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-refnux
cd with-refnux
```

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

This example, just like `with-redux` and `with-mobx` examples, shows how to manage a global state in your web-application.
In this case we are using [refnux](https://github.com/algesten/refnux) which is an alternative, simpler, purely functional store state manager.

We have two very similar pages (page1.js, page2.js). They both

- show the current application state, including a simple counter value
- have a link to jump from one page to the other
- have an 'increment' button to increment the state of the counter
(it triggers the `counterIncrement` action)

When running the example, please, increment the counter and note how moving from page 1 to page 2 and back the state is persisted.
Reloading any of the pages will restore the initial state coming from the server.


### Implementation details

Each page uses `withRefnux` helper which wraps the page in a Provider component.
Page components are connected to the state using refnux `connect` function.

In the `store/` directory you can see a simple implmentation of

- a `getInitialstate` function that returns the initial state of the store. It's used only on SSR
- a `counterIncrement` action that increments the counter state whe user pushes the corresponding button
- a `setTitle` action that's used to set page title during pages `getInitialProps`

If you have any comment / question / pull requests please refer to the [original repository](https://github.com/davibe/next.js-example-with-refnux) where this example is developed and maintained.
