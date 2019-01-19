[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-freactal)

# Freactal example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-freactal with-freactal-app
# or
yarn create next-app --example with-freactal with-freactal-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-freactal
cd with-freactal
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

When it comes to state management of the React webapp, Redux is the most popular solution. However it brings lots of boilerplate code and fiddling aroud multiple files when tracing even simplest state change.

[Freactal](https://github.com/FormidableLabs/freactal) is a state management library that put this disadvantages away. With very little setup code your components' `props` are enhanced with two key ingredients: `state` and `effects`. Another benefit of Freactal is that you don't need to place *state* at some special place (global store). You can even have multiple state roots and compose them together - just like your components (this is true also for `effects`).

### example app

In this example the `index` page renders list of public repos on Github for selected username. It fetches list of repos from public gihub api. First page of this list is rendered by SSR. *serverState* is then hydrated into the `Index` page. Button at the end of the list allows to load next page of repos list from the API on the client.

![](https://i.imgur.com/JFU0YUt.png)

For simplicity the last page is not handled.
