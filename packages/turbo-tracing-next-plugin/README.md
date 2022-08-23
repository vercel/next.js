# `@vercel/turbo-tracing-next-plugin`

## Installation

-   yarn add -D `@vercel/turbo-tracing-next-plugin`
-   npm install -D `@vercel/turbo-tracing-next-plugin`
-   pnpm install -D `@vercel/turbo-tracing-next-plugin`

## Usage

```js
// next.config.js

const { withTurboTracing } = require('@vercel/turbo-tracing-next-plugin')

module.exports = withTurboTracing({
    // turbo tracing options
    log: {
        all: true,
    },
})({
    // next config
})
```

### turbo tracing options

> **Note**
>
> The default options should work fine.

-   `cwd?: string`, default is `process.cwd()`, you can override it to specify another directory to run turbo tracing.
-   `contextDirectory?: string`, relative to cwd, default is `.`.
-   `path?: string`, additional path which will be appended into the `PATH` environment variable.
-   `log?.all?: boolean`, default is `false`, whether to show all logs.
-   `log?.level?: string`, default is `error`, the log level.
-   `log?.detail?: boolean`, default is `false`, whether to expand the log details.
