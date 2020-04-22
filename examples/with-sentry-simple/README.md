[![Deploy To Now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-sentry-simple)

# Sentry (Simple Example)

## How To Use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-sentry-simple with-sentry-simple
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

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## About Example

This is a simple example showing how to use [Sentry](https://sentry.io) to catch & report errors on both client + server side.

- `_app.js` renders on both the server and client. It initializes Sentry to catch any unhandled exceptions
- `_error.js` is rendered by Next.js while handling certain types of exceptions for you. It is overridden so those exceptions can be passed along to Sentry
- `next.config.js` enables source maps in production for Sentry and swaps out `@sentry/node` for `@sentry/browser` when building the client bundle

**Note**: Source maps will not be sent to Sentry when running locally (unless Sentry configuration environment variables are correctly defined during the build step)

**Note**: Error handling [works differently in production](https://nextjs.org/docs#custom-error-handling). Some exceptions will not be sent to Sentry in development mode (i.e. `npm run dev`).

**Note**: The build output will contain warning about unhandled Promise rejections. This caused by the test pages, and is expected.

**Note**: The version of `@zeit/next-source-maps` (`0.0.4-canary.1`) is important and must be specified since it is not yet the default. Otherwise [source maps will not be generated for the server](https://github.com/zeit/next-plugins/issues/377).

**Note**: Both `@zeit/next-source-maps` and `@sentry/webpack-plugin` are added to dependencies (rather than `devDependencies`) is because if used with SSR (ex. heroku), these plugins are used during production for generating the source-maps and sending them to sentry.

### Configuration

You will need a _Sentry DSN_ for your project. You can get it from the settings of your project in **Client Keys (DSN)**. Then, copy the string labeled **DSN (Public)**.

The Sentry DSN should then be updated in `_app.js`.

```js
Sentry.init({
  dsn: 'PUT_YOUR_SENTRY_DSN_HERE',
})
```

More configurations available for [Sentry webpack plugin](https://github.com/getsentry/sentry-webpack-plugin) and using [Sentry Configuration variables](https://docs.sentry.io/cli/configuration/) for defining the releases/verbosity/etc.

### Disabling Sentry during development

An easy way to disable Sentry while developing is to set its `enabled` flag based off of the `NODE_ENV` environment variable, which is [properly configured by the `next` subcommands](https://nextjs.org/docs#production-deployment).

```js
Sentry.init({
  dsn: 'PUT_YOUR_SENTRY_DSN_HERE',
  enabled: process.env.NODE_ENV === 'production',
})
```

### Disabling Sentry uploading during local builds

Unless the `SENTRY_DNS`, `SENTRY_ORG` and `SENTRY_PROJECT` environment variables passed to the build command, Sentry webpack plugin won't be added and the source maps won't be uploaded to sentry.

Check [with-dotenv](https://github.com/zeit/next.js/tree/v9.3.4/examples/with-dotenv) example for integrating `.env` file env variables
