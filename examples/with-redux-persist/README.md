[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-redux-persist)

# Redux Persist example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-redux-persist with-redux-persist-app
# or
yarn create next-app --example with-redux-persist with-redux-persist-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-redux-persist
cd with-redux-persist
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

This example shows how to integrate Redux with the power of Redux Persist in Next.js.

With the advantage of having a global state for your app using `redux`. You'll also require some of your state values to be available offline. There comes `redux-persist` using which you can persist your state in browser's local storage. While there are various ways of persisting your states which you can always find in there [documentation](https://github.com/rt2zz/redux-persist/blob/master/README.md). This is an example of how you can integrate `redux-persist` with redux along with Next.js's universal rendering approach.

In this example, we are going to use the Next.js example [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux-persist) to see how you can add a layer of persistence for the global redux state. To know more about how to create a Next.js project with Redux, you can browse the example project [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) to know more about its implementation.

The Redux Persist has been initialized in `store.js`. You can add more if you need something more with `redux-persist` by following their docs. To wrap out our component in the `Persist Gate` which rehydrates the global state with the persisted values, we'll have to make some modifications in the implementation of Redux in `pages/_app.js` and `pages/_document.js`.

While you can always see the example to start with your own project, but if you want to see the changes, you can do yourself to add `redux-persist`, you can always go to the [commit](https://github.com/ashwamegh/next.js/commit/6fa470290279d9363f79cf9a401a05e8de07c2e2) where I have made the modification.

The example under `components/data-list.js`, shows a simple component that fetches data after being mounted and then dispatches an action to populate the redux state `example-data` with the same data. And if you see `store.js`, we have whitelisted `example-data` state to be persisted. So once the redux state receives the data, it will be persisted to the browser's local storage by `redux-persist`. So if you open the app next time and there is no Internet connection or whatsoever condition, the app will load the persisted data and will render it on the screen.

For simplicity and readability, Reducers, Actions, Redux Persist configuration, and Store creators are all in the same file: `store.js`
