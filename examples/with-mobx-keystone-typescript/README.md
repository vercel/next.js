# mobx-keystone example

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-mobx-keystone-typescript)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-mobx-keystone-typescript with-mobx-keystone-typescript-app
# or
yarn create next-app --example with-mobx-keystone-typescript with-mobx-keystone-typescript-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mobx-keystone-typescript
cd with-mobx-keystone-typescript
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

This example is a typescript and mobx-keysone port of the [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) example. MobX support has been implemented using React Hooks. Decorator support is activated by adding a `.babelrc` file at the root of the project:

```json
{
  "presets": ["next/babel"],
  "plugins": ["transform-decorators-legacy"]
}
```

## The idea behind the example

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use mobx that also works with our universal rendering approach. This is just a way you can do it but it's not the only one.

In this example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

Our page is located at `pages/index.tsx` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the `mobx-keystone` store and returning the initial timestamp to be rendered. The root component for the render method is a React context provider that allows us to send the store down to children components so they can access to the state when required.

To pass the initial timestamp from the server to the client we pass it as a prop called `lastUpdate` so then it's available when the client takes over.

## Implementation

The trick here for supporting universal mobx is to separate the cases for the client and the server. When we are on the server we want to create a new store every time, otherwise different users data will be mixed up. If we are in the client we want to use always the same store. That's what we accomplish on `store.ts`

After initializing the store (and possibly making changes such as fetching data), `getInitialProps` must stringify the store in order to pass it as props to the client. `mobx-keystone` comes out of the box with a handy method for doing this called `getSnapshot`. The snapshot is passed down to `StoreProvider` via `snapshot` prop where it's used to rehydrate `RootStore` and provide context with `StoreContext`

```tsx
export const StoreContext = createContext<RootStore | null>(null)

export const StoreProvider: FC<{ snapshot?: SnapshotInOf<RootStore> }> = ({
  children,
  snapshot,
}) => {
  const [ctxStore] = useState(() => initStore(snapshot))
  return (
    <StoreContext.Provider value={ctxStore}>{children}</StoreContext.Provider>
  )
}
```

The store is accessible at any depth by using the StoreContext or `useStore` hook

```tsx
export function useStore() {
  const store = useContext(StoreContext)

  if (!store) {
    // this is especially useful in TypeScript so you don't need to be checking for null all the time
    throw new Error('useStore must be used within a StoreProvider.')
  }

  return store
}
```

The clock, under `components/Clock.tsx`, reacts to changes in the observable `store` by means of the `useObserver` hook.

```tsx
<div>
  //...
  {useObserver(() => (
    <Clock lastUpdate={store.lastUpdate} light={store.light} />
  ))}
  //...
</div>
```
