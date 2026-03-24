---
title: logging
description: Configure logging behavior in the terminal when running Next.js in development mode, including fetch logging, incoming requests, and forwarding browser console logs to the terminal.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

## Options

<AppOnly>

### Fetching

You can configure the logging level and whether the full URL is logged to the console when running Next.js in development mode.

```js filename="next.config.js"
module.exports = {
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}
```

Any `fetch` requests that are restored from the [Server Components HMR cache](/docs/app/api-reference/config/next-config-js/serverComponentsHmrCache) are not logged by default. However, this can be enabled by setting `logging.fetches.hmrRefreshes` to `true`.

```js filename="next.config.js"
module.exports = {
  logging: {
    fetches: {
      hmrRefreshes: true,
    },
  },
}
```

### Server Functions

[Server Function](https://react.dev/reference/rsc/server-functions) invocations are logged by default during development. You can disable this by setting `logging.serverFunctions` to `false`.

```js filename="next.config.js"
module.exports = {
  logging: {
    serverFunctions: false,
  },
}
```

When enabled, the terminal displays each Server Function call with its function name, arguments, and duration:

```bash filename="Terminal"
POST /
  └─ ƒ myAction(arg1, arg2) in 5ms app/actions.ts
```

</AppOnly>

### Incoming Requests

By default all the incoming requests will be logged in the console during development. You can use the `incomingRequests` option to decide which requests to ignore.
Since this is only logged in development, this option doesn't affect production builds.

```js filename="next.config.js"
module.exports = {
  logging: {
    incomingRequests: {
      ignore: [/\api\/v1\/health/],
    },
  },
}
```

Or you can disable incoming request logging by setting `incomingRequests` to `false`.

```js filename="next.config.js"
module.exports = {
  logging: {
    incomingRequests: false,
  },
}
```

### Browser Console Logs

You can forward browser console logs (such as `console.log`, `console.warn`, `console.error`) to the terminal during development. This is useful for debugging client-side code without needing to check the browser's developer tools.

```js filename="next.config.js"
module.exports = {
  logging: {
    browserToTerminal: true,
  },
}
```

#### Options

The `browserToTerminal` option accepts the following values:

| Value     | Description                                         |
| --------- | --------------------------------------------------- |
| `'warn'`  | Forward only warnings and errors, by default        |
| `'error'` | Forward only errors                                 |
| `true`    | Forward all console output (log, info, warn, error) |
| `false`   | Disable browser log forwarding                      |

```js filename="next.config.js"
module.exports = {
  logging: {
    browserToTerminal: 'warn',
  },
}
```

#### Source Location

When enabled, browser logs include source location information (file path and line number) by default. For example:

<AppOnly>

```tsx filename="app/page.tsx" highlight={8}
'use client'

export default function Home() {
  return (
    <button
      type="button"
      onClick={() => {
        console.log('Hello World')
      }}
    >
      Click me
    </button>
  )
}
```

Clicking the button prints this message to the terminal:

```bash filename="Terminal"
[browser] Hello World (app/page.tsx:8:17)
```

</AppOnly>

<PagesOnly>

```tsx filename="pages/index.tsx" highlight={6}
export default function Home() {
  return (
    <button
      type="button"
      onClick={() => {
        console.log('Hello World')
      }}
    >
      Click me
    </button>
  )
}
```

Clicking the button prints this message to the terminal:

```bash filename="Terminal"
[browser] Hello World (pages/index.tsx:6:17)
```

</PagesOnly>

### Disabling Logging

In addition, you can disable the development logging by setting `logging` to `false`.

```js filename="next.config.js"
module.exports = {
  logging: false,
}
```

## Version History

| Version   | Changes                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `v16.2.0` | `browserToTerminal` added (moved from `experimental.browserDebugInfoInTerminal`) |
| `v15.4.0` | `experimental.browserDebugInfoInTerminal` introduced                             |
| `v15.2.0` | `incomingRequests` added                                                         |
| `v15.0.0` | `logging: false` option added, `fetches.hmrRefreshes` added for App Router       |
| `v14.0.0` | `logging.fetches` moved to stable for App Router                                 |
