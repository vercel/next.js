# MobX example

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use MobX that also works with our universal rendering approach. This is just a way you can do it but it's not the only one.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-mobx-react-lite)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mobx-react-lite with-mobx-react-lite-app
# or
yarn create next-app --example with-mobx-react-lite with-mobx-react-lite-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mobx-react-lite
cd with-mobx-react-lite
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

In this example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

This example is a mobx-react-lite port of the [with-mobx](https://github.com/zeit/next.js/tree/master/examples/with-mobx) example. MobX support has been implemented using React Hooks.

Our page is located at `pages/index.js` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the MobX store and returning the initial timestamp to be rendered. The root component for the render method is a React context provider that allows us to send the store down to children components so they can access to the state when required.

To pass the initial timestamp from the server to the client we pass it as a prop called `lastUpdate` so then it's available when the client takes over.

## Inplementation details

The initial store data is returned from the `initializeData` function that recycles existing store data if it already exists.

```jsx
function initializeData(initialData = store || {}) {
  const { lastUpdate = Date.now(), light } = initialData
  return {
    lastUpdate,
    light: Boolean(light),
  }
}
```

The observable store is created in a function component by passing a plain JavaScript object to the `useObservable` hook. Actions on the observable store (`start` and `stop`) are created in the same scope as the `store` in `store.js` and exported as named exports.

```js
store = useObservable(initializeData(props.initialData))

start = useCallback(
  action(() => {
    // Async operation that mutates the store
  })
)

stop = () => {
  // Does not mutate the store
}
```

The component creates and exports a new React context provider that will make the store accessible to all of its descendents.

```jsx
return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
```

The store is accessible at any depth by using the `StoreContext`.

```js
const store = useContext(StoreContext)
```

The clock, under `components/Clock.js`, reacts to changes in the observable `store` by means of the `useObserver` hook.

```jsx
return (
  <div>
    // ...
    {useObserver(() => (
      <Clock lastUpdate={store.lastUpdate} light={store.light} />
    ))}
    // ...
  </div>
)
```
