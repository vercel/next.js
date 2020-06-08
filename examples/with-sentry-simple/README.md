[![Deploy To Now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/vercel/next.js/tree/master/examples/with-sentry-simple)

# Sentry (Simple Example)

This is a simple example showing how to use [Sentry](https://sentry.io) to catch & report errors on both client + server side.

- `_app.js` renders on both the server and client. It initializes Sentry to catch any unhandled exceptions
- `_error.js` is rendered by Next.js while handling certain types of exceptions for you. It is overridden so those exceptions can be passed along to Sentry
- `next.config.js` enables source maps in production for Sentry and swaps out `@sentry/node` for `@sentry/browser` when building the client bundle

## How To Use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-sentry-simple with-sentry-simple
# or
yarn create next-app --example with-sentry-simple with-sentry-simple
```

### Download Manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-sentry-simple
cd with-sentry-simple
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

- By default, neither sourcemaps nor error tracking is enabled in development mode (see Configuration).
- When enabled in development mode, error handling [works differently than in production](https://nextjs.org/docs#custom-error-handling) as `_error.js` is never actually called.
- The build output will contain warning about unhandled Promise rejections. This is caused by the test pages, and is expected.
- The version of `@zeit/next-source-maps` (`0.0.4-canary.1`) is important and must be specified since it is not yet the default. Otherwise [source maps will not be generated for the server](https://github.com/zeit/next-plugins/issues/377).
- Both `@zeit/next-source-maps` and `@sentry/webpack-plugin` are added to dependencies (rather than `devDependencies`) because if used with SSR, these plugins are used during production for generating the source-maps and sending them to sentry.

## Configuration

### Error tracking

1. Copy your Sentry DSN. You can get it from the settings of your project in **Client Keys (DSN)**. Then, copy the string labeled **DSN (Public)**.
2. Put the DSN inside the `SENTRY_DSN` environment variable inside a new environment file called `.env.local`

> **Note:** Error tracking is disabled in development mode using the `NODE_ENV` environment variable. To change this behaviour, remove the `enabled` property from the `Sentry.init()` call inside your `_app.js` file.

### Automatic sourcemap upload (optional)

1. Set up the `SENTRY_DSN` environment variable as described above.
2. Save your Sentry Organization slug inside the `SENTRY_ORG` and your project slug inside the `SENTRY_PROJECT` environment variables.
3. Create an auth token in Sentry. The recommended way to do this is by creating a new internal integration for your organization. To do so, go into Settings > Developer Settings > New internal integration. After the integration is created, copy the Token.
4. Save the token inside the `SENTRY_AUTH_TOKEN` environment variable.

> **Note:** Sourcemap upload is disabled in development mode using the `NODE_ENV` environment variable. To change this behaviour, remove the `NODE_ENV === 'production'` check from your `next.config.js` file.

### Other configuration options

More configurations are available for the [Sentry webpack plugin](https://github.com/getsentry/sentry-webpack-plugin) using [Sentry Configuration variables](https://docs.sentry.io/cli/configuration/) for defining the releases/verbosity/etc.
