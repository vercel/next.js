# MobX State Tree example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-mobx-state-tree with-mobx-state-tree-app
# or
yarn create next-app --example with-mobx-state-tree with-mobx-state-tree-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mobx-state-tree
cd with-mobx-state-tree
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

## Notes

This example is a mobx port of the [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) example. Decorator support is activated by adding a `.babelrc` file at the root of the project:

```json
{
  "presets": ["next/babel"],
  "plugins": ["transform-decorators-legacy"]
}
```

### Rehydrating with server data

After initializing the store (and possibly making changes such as fetching data), `getInitialProps` must stringify the store in order to pass it as props to the client. `mobx-state-tree` comes out of the box with a handy method for doing this called `getSnapshot`. The snapshot is sent to the client as `props.initialState` where the pages's `constructor()` may use it to rehydrate the client store.

## The idea behind the example

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use mobx that also works with our universal rendering approach. This is just a way you can do it but it's not the only one.

In this example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

Our page is located at `pages/index.js` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the mobx-state-tree store and returning the initial timestamp to be rendered. The root component for the render method is the `mobx-react <Provider>` that allows us to send the store down to children components so they can access to the state when required.

To pass the initial timestamp from the server to the client we pass it as a prop called `lastUpdate` so then it's available when the client takes over.

The trick here for supporting universal mobx is to separate the cases for the client and the server. When we are on the server we want to create a new store every time, otherwise different users data will be mixed up. If we are in the client we want to use always the same store. That's what we accomplish on `store.js`

The clock, under `components/Clock.js`, has access to the state using the `inject` and `observer` functions from `mobx-react`. In this case Clock is a direct child from the page but it could be deep down the render tree.