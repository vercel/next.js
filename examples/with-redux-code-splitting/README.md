
[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-redux-code-splitting)

# Redux with code splitting example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-redux-code-splitting with-redux-code-splitting-app
# or
yarn create next-app --example with-redux-code-splitting with-redux-code-splitting-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-redux-code-splitting
cd with-redux-code-splitting
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

Redux uses single store per application and usually it causes problems for code splitting when you want to load actions and reducers used on the current page only.

This example utilizes [fast-redux](https://github.com/dogada/fast-redux) to split Redux's actions and reducers across pages. In result each page's javascript bundle contains only code that is used on the page. When user navigates to a new page, its actions and reducers are connected to the single shared application store.