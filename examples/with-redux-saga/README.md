# redux-saga example

> This example and documentation is based on the [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) example.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-redux-saga)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-redux-saga with-redux-saga-app
# or
yarn create next-app --example with-redux-saga with-redux-saga-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-redux-saga
cd with-redux-saga
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

Usually splitting your app state into `pages` feels natural, but sometimes you'll want to have global state for your app. This is an example using `redux` and `redux-saga` that works with universal rendering. This is just one way it can be done. If you have any suggestions or feedback please submit an issue or PR.

In the first example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

Our page is located at `pages/index.js` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the redux store and dispatching the required actions until we are ready to return the initial state to be rendered. Since the component is wrapped with `next-redux-wrapper`, the component is automatically connected to Redux and wrapped with `react-redux Provider`, that allows us to access redux state immediately and send the store down to children components so they can access to the state when required.

For safety it is recommended to wrap all pages, no matter if they use Redux or not, so that you should not care about it anymore in all child components.

`withRedux` function accepts `makeStore` as first argument, all other arguments are internally passed to `react-redux connect()` function. `makeStore` function will receive initialState as one argument and should return a new instance of redux store each time when called, no memoization needed here. See the [full example](https://github.com/kirill-konshin/next-redux-wrapper#usage) in the Next Redux Wrapper repository. And there's another package [next-connect-redux](https://github.com/huzidaha/next-connect-redux) available with similar features.

To pass the initial state from the server to the client we pass it as a prop called `initialState` so then it's available when the client takes over.

The trick here for supporting universal redux is to separate the cases for the client and the server. When we are on the server we want to create a new store every time, otherwise different users data will be mixed up. If we are in the client we want to use always the same store. That's what we accomplish in `store.js`

The clock, under `components/clock.js`, has access to the state using the `connect` function from `react-redux`. In this case Clock is a direct child from the page but it could be deep down the render tree.

The second example, under `components/counter.js`, shows a simple add counter function with a class component implementing a common redux pattern of mapping state and props. Again, the first render is happening in the server and instead of starting the count at 0, it will dispatch an action in redux that starts the count at 1. This continues to highlight how each navigation triggers a server render first and then a client render second, when you navigate between pages.

## What changed with next-redux-saga

The digital clock is updated every second using the `runClockSaga` found in `saga.js`.

All pages are also being wrapped by `next-redux-saga` using a helper function from `store.js`:

```js
import withRedux from 'next-redux-wrapper'
import nextReduxSaga from 'next-redux-saga'
import configureStore from './store'

export function withReduxSaga(BaseComponent) {
  return withRedux(configureStore)(nextReduxSaga(BaseComponent))
}

/**
 * Usage:
 *
 * class Page extends Component {
 *   // implementation
 * }
 *
 * export default withReduxSaga(Page)
 */
```

If you need to pass `react-redux` connect args to your page, you could use the following helper instead:

```js
import withRedux from 'next-redux-wrapper'
import nextReduxSaga from 'next-redux-saga'
import configureStore from './store'

export function withReduxSaga(...connectArgs) {
  return BaseComponent =>
    withRedux(configureStore, ...connectArgs)(nextReduxSaga(BaseComponent))
}

/**
 * Usage:
 *
 * class Page extends Component {
 *   // implementation
 * }
 *
 * export default withReduxSaga(state => state)(Page)
 */
```

Since `redux-saga` is like a separate thread in your application, we need to tell the server to END the running saga when all asynchronous actions are complete. This is automatically handled for you by wrapping your components in `next-redux-saga`. To illustrate this, `pages/index.js` loads placeholder JSON data on the server from [https://jsonplaceholder.typicode.com/users](https://jsonplaceholder.typicode.com/users). If you refresh `pages/other.js`, the placeholder JSON data will **NOT** be loaded on the server, however, the saga is running on the client. When you click _Navigate_, you will be taken to `pages/index.js` and the placeholder JSON data will be fetched from the client. The placeholder JSON data will only be fetched **once** from the client or the server.

After introducing `redux-saga` there was too much code in `store.js`. For simplicity and readability, the actions, reducers, sagas, and store creators have been split into seperate files: `actions.js`, `reducer.js`, `saga.js`, `store.js`
