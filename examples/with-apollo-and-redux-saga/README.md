[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-apollo-and-redux)
# Apollo & Redux Saga Example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-apollo-and-redux-saga with-apollo-and-redux-saga-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-apollo-and-redux-saga
cd with-apollo-and-redux-saga
```

Install it and run:

```bash
npm install
npm run dev
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
});

export default withReduxSaga(connect(mapStateToProps, null)(Index));
```

`connect` must go inside `withReduxSaga` otherwise `connect` will not be able to find the store.
