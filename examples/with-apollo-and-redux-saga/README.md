# Apollo & Redux Saga Example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-apollo-and-redux-saga with-apollo-and-redux-saga-app
# or
yarn create next-app --example with-apollo-and-redux-saga with-apollo-and-redux-saga-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-apollo-and-redux-saga
cd with-apollo-and-redux-saga
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

## The idea behind the example

In 2.0.0, Apollo Client severs out-of-the-box support for redux in favor of Apollo's client side state management. This example aims to be an amalgamation of the [`with-apollo`](https://github.com/zeit/next.js/tree/master/examples/with-apollo) and [`with-redux-saga`](https://github.com/zeit/next.js/tree/master/examples/with-redux-saga) examples.

Note that you can access the redux store like you normally would using `react-redux`'s `connect`. Here's a quick example:

```js
const mapStateToProps = state => ({
  location: state.form.location,
})

export default withReduxSaga(
  connect(
    mapStateToProps,
    null
  )(Index)
)
```

`connect` must go inside `withReduxSaga` otherwise `connect` will not be able to find the store.

### Note:

In these _with-apollo_ examples, the `withData()` HOC must wrap a top-level component from within the `pages` directory. Wrapping a child component with the HOC will result in a `Warning: Failed prop type: The prop 'serverState' is marked as required in 'WithData(Apollo(Component))', but its value is 'undefined'` error. Down-tree child components will have access to Apollo, and can be wrapped with any other sort of `graphql()`, `compose()`, etc HOC's.
