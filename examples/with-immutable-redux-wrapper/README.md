# Immutable Redux Example

> This example and documentation is based on the [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) example.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-immutable-redux-wrapper with-immutable-redux-wrapper-app
# or
yarn create next-app --example with-immutable-redux-wrapper with-immutable-redux-wrapper-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-immutable-redux-wrapper
cd with-immutable-redux-wrapper
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

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use redux that also works with our universal rendering approach. This is just a way you can do it but it's not the only one.

In the first example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

Our page is located at `pages/index.js` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the redux store and dispatching the required actions until we are ready to return the initial state to be rendered. Since the component is wrapped with `next-redux-wrapper`, the component is automatically connected to Redux and wrapped with `react-redux Provider`, that allows us to access redux state immediately and send the store down to children components so they can access to the state when required.

For safety it is recommended to wrap all pages, no matter if they use Redux or not, so that you should not care about it anymore in all child components.

`withRedux` function accepts `makeStore` as first argument, all other arguments are internally passed to `react-redux connect()` function. `makeStore` function will receive initialState as one argument and should return a new instance of redux store each time when called, no memoization needed here. See the [full example](https://github.com/kirill-konshin/next-redux-wrapper#usage) in the Next Redux Wrapper repository. And there's another package [next-connect-redux](https://github.com/huzidaha/next-connect-redux) available with similar features.

To pass the initial state from the server to the client we pass it as a prop called `initialState` so then it's available when the client takes over.

The trick here for supporting universal redux is to separate the cases for the client and the server. When we are on the server we want to create a new store every time, otherwise different users data will be mixed up. If we are in the client we want to use always the same store. That's what we accomplish on `store.js`

The clock, under `components/Clock.js`, has access to the state using the `connect` function from `react-redux`. In this case Clock is a direct child from the page but it could be deep down the render tree.

The second example, under `components/AddCount.js`, shows a simple add counter function with a class component implementing a common redux pattern of mapping state and props. Again, the first render is happening in the server and instead of starting the count at 0, it will dispatch an action in redux that starts the count at 1. This continues to highlight how each navigation triggers a server render first and then a client render second, when you navigate between pages.

For simplicity and readability, Reducers, Actions, and Store creators are all in the same file: `store.js`

## What changed with immutable-redux-wrapper

Immutability can bring increased performance to your app, and leads to simpler programming and debugging, as data that never changes is easier to reason about than data that is free to be changed arbitrarily throughout your app.

In fact, Redux requires your state to be immutable. You do not have to use Immutable.JS as regular JavaScript, when written correctly, is perfectly capable of providing immutability on its own. However, guaranteeing immutability with JavaScript is difficult, and it can be easy to mutate an object accidentally, causing both bugs in your app that are extremely difficult to locate. For this reason, using an immutable update library such as Immutable.JS can significantly improve the reliability of your app and make your app's development much easier.

[Read more](https://redux.js.org/faq/immutable-data#what-approaches-are-there-for-handling-data-immutability-do-i-have-to-use-immutable-js) about the importance of immutability in Redux here.

This example wraps the exiting with-redux-wrapper example in Immutable.JS and displays how to pass immutable data from state to components.
