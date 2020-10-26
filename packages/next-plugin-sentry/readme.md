# Next.js + Sentry

Capture unhandled exceptions with Sentry in your Next.js project.

## Installation

```
npm install @next/plugin-sentry
```

or

```
yarn add @next/plugin-sentry
```

Provide necessary env variables through `.env` or available way

```
NEXT_PUBLIC_SENTRY_DSN

// variables below are required only when using with @next/sentry-source-maps
NEXT_PUBLIC_SENTRY_RELEASE
SENTRY_PROJECT
SENTRY_ORG
SENTRY_AUTH_TOKEN
```

### Usage

Create a next.config.js

```js
// next.config.js
module.exports = {
  experimental: { plugins: true },
}
```

With only that, you'll get a complete error coverage for your application.
If you want to use Sentry SDK APIs, you can do so in both, server-side and client-side code with the same namespace from the plugin.

```js
import { Sentry } from '@next/plugin-sentry'

const MyComponent = () => <h1>Server Test 1</h1>

export function getServerSideProps() {
  if (!this.veryImportantValue) {
    Sentry.withScope((scope) => {
      scope.setTag('method', 'getServerSideProps')
      Sentry.captureMessage('veryImportantValue is missing')
    })
  }

  return {}
}

export default MyComponent
```

### Configuration

There are two ways to configure Sentry SDK. One through `next.config.js` which allows for the full configuration of the server-side code, and partial configuration of client-side code. And additional method for client-side code.

```js
// next.config.js
module.exports = {
  experimental: { plugins: true },
  // Sentry.init config for server-side code. Can accept any available config option.
  serverRuntimeConfig: {
    sentry: {
      type: 'server',
    },
  },
  // Sentry.init config for client-side code (and fallback for server-side)
  // can accept only serializeable values. For more granular control see below.
  publicRuntimeConfig: {
    sentry: {
      type: 'client',
    },
  },
}
```

If you need to pass config options for the client-side, that are non-serializable, for example `beforeSend` or `beforeBreadcrumb`:

```js
// _app.js
import { clientConfig } from '@next/plugin-sentry'

clientConfig.beforeSend = () => {
  /* ... */
}
clientConfig.beforeBreadcrumb = () => {
  /* ... */
}
```
