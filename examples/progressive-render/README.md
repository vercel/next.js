[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/progressive-render)
# Example app implementing progressive server-side render

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example progressive-render progressive-render-app
# or
yarn create next-app --example progressive-render progressive-render-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/progressive-render
cd progressive-render
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

Sometimes you want to **not** server render some parts of your application. That can be third party components without server render capabilities, components that depends on `window` and other browser only APIs or just because that content isn't important enough for the user (eg. below the fold content).

In that case you can wrap the component in `react-no-ssr` which will only render the component client-side.

This example features:

* An app with a component that must only be rendered in the client
* A loading component that will be displayed before rendering the client-only component
