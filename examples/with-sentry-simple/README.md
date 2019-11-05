[![Deploy To Now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-sentry-simple)

# Sentry (Simple Example)

## How To Use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

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

This example uses the new [next-plugin-sentry](https://github.com/zeit/next.js/tree/canary/packages/next-plugin-sentry) package to catch & report errors on both client + server side.

### Configuration

You will need a [Sentry DSN](https://sentry.io) for your project. You can get it from the settings of your project in **Client Keys (DSN)**. Then, copy the string labeled **DSN (Public)**.

The Sentry DSN should then be updated in `next.config.js`.

```js
module.exports = withSourceMaps({
  env: {
    SENTRY_DSN: 'hello-world',
    // would want to synchronously grab git commit id here for
    // best debugging experience
    SENTRY_RELEASE: '0.0.1'
  }
})
```

### Notes

- Source maps will not be sent to Sentry when running locally (because Sentry cannot access your `localhost`). To accurately test client-side source maps, please deploy to Now.
- Server-side source maps will not work unless you [manually upload them to Sentry](https://docs.sentry.io/platforms/node/sourcemaps/#making-source-maps-available-to-sentry).
- Error handling [works differently in production](https://nextjs.org/docs#custom-error-handling). Some exceptions will not be sent to Sentry in development mode (i.e. `npm run dev`).
- The build output will contain warning about unhandled Promise rejections. This caused by the test pages, and is expected.
- The version of `@zeit/next-source-maps` (`0.0.4-canary.1`) is important and must be specified since it is not yet the default. Otherwise [source maps will not be generated for the server](https://github.com/zeit/next-plugins/issues/377).

### Disabling Sentry during development

Sentry can be disabled by not providing a DSN. Modify `next.config.js` to remove the DSN based on the environment.

```js
SENTRY_DSN: process.env.NODE_ENV === 'production' && 'YOUR-DSN'
```

### Hosting source maps vs. uploading them to Sentry

This example shows how to generate your own source maps, which are hosted alongside your JavaScript bundles in production. But that has the potential for innaccurate results in Sentry.

Sentry will attempt to [fetch the source map](https://docs.sentry.io/platforms/javascript/sourcemaps/#hosting--uploading) when it is processing an exception, as long as the "Enable JavaScript source fetching" setting is turned on for your Sentry project.

However, there are some disadvantages with this approach. Sentry has written a blog post about them here: https://blog.sentry.io/2018/07/17/source-code-fetching

If you decide that uploading source maps to Sentry would be better, one approach is to define a custom `now-build` script in your `package.json`. Zeit Now's `@now/next` builder will [call this script](https://github.com/zeit/now/blob/canary/packages/now-next/src/index.ts#L270) for you. You can define what to do after a build there:

```
"now-build": "next build && node ./post-build.js"
```

In `./post-build.js` you can `require('@sentry/cli')` and go through the process of creating a Sentry release and [uploading source maps](https://docs.sentry.io/cli/releases/#sentry-cli-sourcemaps), and optionally deleting the `.js.map` files so they are not made public.
