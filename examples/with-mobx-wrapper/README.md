[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-mobx-wrapper)

# MobX example

> Multiple stores with [next-mobx-wrapper](https://github.com/nghiepit/next-mobx-wrapper)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-mobx-wrapper with-mobx-wrapper-app
# or
yarn create next-app --example with-mobx-wrapper with-mobx-wrapper-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mobx-wrapper
cd with-mobx-wrapper
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

Decorator support is activated by adding a `.babelrc` file at the root of the project:

```json
{
  "presets": ["next/babel"],
  "plugins": [
    ["@babel/plugin-proposal-decorators", {"legacy": true}],
    ["@babel/plugin-proposal-class-properties", {"loose": true}]
  ]
}
```

### Rehydrating with server data

Be aware that data that was used on the server (and provided via `getInitialProps`) will be stringified in order to rehydrate the client with it. That means, if you create a store that is, say, an `ObservableMap` and give it as prop to a page, then the server will render appropriately. ~~But stringifying it for the client will turn the `ObservableMap` to an ordinary JavaScript object (which does not have `Map`-style methods and is not an observable). So it is better to create the store as a normal object and turn it into a `Observable` in the `render()` method. This way both sides have an `Observable` to work with.~~

## The idea behind the example
