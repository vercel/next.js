[![Deploy To Now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-sentry-simple)

# Sentry (Simple Example)

## How To Use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-sentry-simple with-sentry-simple
# or
yarn create next-app --example with-sentry-simple with-sentry-simple
```

### Download Manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-sentry-simple
cd with-sentry-simple
```

Install it and run:

**NPM**

```bash
npm install
npm run dev
```

**Yarn**

```bash
yarn
yarn dev
```

Deploy it to the cloud with [Now](https://zeit.co/now) ([Download](https://zeit.co/download))

```bash
now
```

## About Example

This is a simple example showing how to use [Sentry](https://sentry.io) to catch & report errors on both client + server side.

- `_document.js` is _server-side only_ and is used to change the initial server-side rendered document markup. We listen at the node process level to capture exceptions.
- `_app.js` is client-side only and is used to initialize pages. We use the `componentDidCatch` lifecycle method to catch uncaught exceptions.

**Note**: Source maps will not be sent to Sentry when running locally. It's also possible you will see duplicate errors sent when testing
locally due to hot reloading. For a more accurate simulation, please deploy to Now.

### Configuration

You will need a _Sentry DSN_ for your project. You can get it from the settings of your project in **Client Keys (DSN)**. Then, copy the string labeled **DSN (Public)**.

The Sentry DSN should then be updated in `_app.js`.

```js
Sentry.init({
  dsn: 'PUT_YOUR_SENTRY_DSN_HERE'
});
```

_Note: Committing environment variables is not secure and is done here only for demonstration purposes. See the [`with-dotenv`](../with-dotenv) or [`with-now-env`](../with-now-env) for examples of how to set environment variables safely._
