# Redux-Observable example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-redux-observable with-redux-observable-app
# or
yarn create next-app --example with-redux-observable with-redux-observable-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-redux-observable
cd with-redux-observable
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```


### The idea behind the example

This example is a page that renders information about Star-Wars characters. It
fetches new character every 3 seconds having the initial character fetched on
a server.

Example also uses `redux-logger` to log every action.

![demo page](demo.png)

The main problem with integrating Redux, Redux-Observable and Next.js is
probably making initial requests on a server. That's because, the
`getInitialProps` hook runs on the server-side before epics have been made available by just dispatching actions.

However, we can access and execute epics directly. In order to do so, we need to
pass them an Observable of an action together with StateObservable and they will return an Observable:

```js
static async getInitialProps({ store, isServer }) {
  const state$ = new StateObservable(new Subject(), store.getState());
  const resultAction = await rootEpic(
    of(actions.fetchCharacter(isServer)),
    state$
  ).toPromise(); // we need to convert Observable to Promise
  store.dispatch(resultAction)};
```

Note: we are not using `AjaxObservable` from the `rxjs` library; as of rxjs
v5.5.6, it will not work on both the server- and client-side. Instead we call
the default export from
[universal-rxjs-ajax](https://www.npmjs.com/package/universal-rxjs-ajax) (as
`request`).

We transform the Observable we get from `ajax` into a Promise in order to await
its resolution. That resolution should be a action (since the epic returns
Observables of actions). We immediately dispatch that action to the store. 

This server-side solution allows compatibility with Next. It may not be
something you wish to emulate. In other situations, calling or awaiting epics
directly and passing their result to the store would be an anti-pattern. You
should only trigger epics by dispatching actions. This solution may not
generalise to resolving more complicated sets of actions. 

The layout of the redux related functionality is split between:

    - actions (in `redux/actions.js`)
    - actionTypes (in `redux/actionTypes.js`)
    - epics (in `redux/epics.js`)
    - reducer (in `redux/reducer.js`)

and organized in `redux/index.js`.

Excepting in those manners discussed above, the configuration is similar the
configuration found in [with-redux example](https://github.com/zeit/next.js/tree/canary/examples/with-redux) 
and [redux-observable docs](https://redux-observable.js.org/). 
