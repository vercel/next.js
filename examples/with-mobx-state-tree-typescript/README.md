# MobX State Tree example

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use mobx that also works with our universal rendering approach. This is just a way you can do it but it's not the only one.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-mobx-state-tree-typescript)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mobx-state-tree-typescript with-mobx-state-tree-typescript-app
# or
yarn create next-app --example with-mobx-state-tree-typescript with-mobx-state-tree-typescript-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mobx-state-tree-typescript
cd with-mobx-state-tree-typescript
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

This example is a typescript and mobx-state-tree port of the [with-redux](https://github.com/zeit/next.js/tree/master/examples/with-redux) example, by way of the javascript and mobx-state-tree port [with-mobx-state-tree](https://github.com/zeit/next.js/tree/master/examples/with-mobx-state-tree). Decorator support is activated by adding a `.babelrc` file at the root of the project:

```json
{
  "presets": ["next/babel"],
  "plugins": ["transform-decorators-legacy"]
}
```

### Rehydrating with server data

After initializing the store (and possibly making changes such as fetching data), `getInitialProps` must stringify the store in order to pass it as props to the client. `mobx-state-tree` comes out of the box with a handy method for doing this called `getSnapshot`. The snapshot is sent to the client as `props.initialState` where the pages's `constructor()` may use it to rehydrate the client store.

## Notes

In this example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color than the client one.

![](http://i.imgur.com/JCxtWSj.gif)

Our page is located at `pages/index.tsx` so it will map the route `/`. To get the initial data for rendering we are implementing the static method `getInitialProps`, initializing the mobx-state-tree store and returning the initial timestamp to be rendered. The root component for the render method is the `mobx-react <Provider>` that allows us to send the store down to children components so they can access to the state when required.

To pass the initial timestamp from the server to the client we pass it as a prop called `lastUpdate` so then it's available when the client takes over.

The trick here for supporting universal mobx is to separate the cases for the client and the server. When we are on the server we want to create a new store every time, otherwise different users data will be mixed up. If we are in the client we want to use always the same store. That's what we accomplish on `store.ts`

The clock, under `components/Clock.tsx`, has access to the state using the `inject` and `observer` functions from `mobx-react`. In this case Clock is a direct child from the page but it could be deep down the render tree.

The typescript in this `with-mobx-state-tree-typescript` repo differs only slightly from the javascript `with-mobx-state-tree`, with most of the the changes made to avoid warnings and errors when running the code through `tslint` (which can be done via the `npm run tslint` command if desired). To keep this repo simple, the `<styled>` component (which is used by the javascript-based `with-redux` and `with-mobx-state-tree` examples for the clock component) is not used in this repo. The `<styled>` library can be used with typescript but it requires a more complicated interplay between the typescript and babel stages than is needed for most other components and libraries, so it's not included here to keep things simple and broadly applicable.
