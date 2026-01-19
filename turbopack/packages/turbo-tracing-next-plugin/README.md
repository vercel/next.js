# `@vercel/experimental-nft-next-plugin`

## Installation

- yarn add -D `@vercel/experimental-nft-next-plugin`
- npm install -D `@vercel/experimental-nft-next-plugin`
- pnpm install -D `@vercel/experimental-nft-next-plugin`

## Usage

```js
// next.config.js

const { createNodeFileTrace } = require('@vercel/experimental-nft-next-plugin')

const withNodeFileTrace = createNodeFileTrace({
  // experimental nft options
  log: {
    all: true,
  },
})

module.exports = withNodeFileTrace({
  // next config
})
```

### experimental nft options

> **Note**
>
> The default options should work fine.

- `cwd?: string`, default is `process.cwd()`, you can override it to specify another directory to run experimental nft.
- `contextDirectory?: string`, relative to cwd, default is `.`. It must be the directory where the `node_modules` directory is located. If you are in the monorepo, you should set it to the root directory of the monorepo. For yarn2+/npm workspaces, the default value will respect the `PROJECT_CWD` and `npm_config_local_prefix` environment variables injected by yarn/npm client. If the default value doesn't work, you can override it to specify the root directory of the monorepo.
- `path?: string`, additional path which will be appended into the `PATH` environment variable.
- `log?.all?: boolean`, default is `false`, whether to show all logs.
- `log?.level?: string`, default is `error`, the log level.
- `log?.detail?: boolean`, default is `false`, whether to expand the log details.
