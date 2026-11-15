---
title: turbopackPluginRuntimeStrategy
description: Choose how Turbopack runs Node.js evaluation for webpack loaders, Babel, and PostCSS.
version: experimental
related:
  links:
    - app/api-reference/config/next-config-js/turbopack
---

The `experimental.turbopackPluginRuntimeStrategy` option chooses whether Turbopack runs Node.js evaluation in child processes or worker threads.

```ts filename="next.config.ts" switcher highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
}

module.exports = nextConfig
```

This runtime executes Node.js-based tools, including [webpack loaders](/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders), Babel, and PostCSS.

## Reference

| Value                  | Default | Description                                                                                                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'childProcesses'`     | Yes     | Runs Node.js evaluation in a pool of child processes and communicates with them over sockets.                                                          |
| `'workerThreads'`      | No      | Runs Node.js evaluation in worker threads within the Next.js process. This can reduce memory and CPU overhead compared with a child process pool.      |
| `'forceWorkerThreads'` | No      | Uses worker threads even when the current Node.js version is affected by the worker-thread teardown issue described below. This can abort the process. |

## Node.js compatibility

On Node.js 24.13.1 and newer, a [Node.js worker-thread teardown issue](https://github.com/nodejs/node/issues/65100) can abort the process when a worker exits while a native addon has a live Node-API thread-safe function.

When `turbopackPluginRuntimeStrategy` is set to `'workerThreads'` on an affected Node.js version, Next.js prints a warning and falls back to `'childProcesses'`. Set `'forceWorkerThreads'` to bypass the fallback at the risk of aborting the process.

## Version History

| Version   | Changes                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `v16.4.0` | `experimental.turbopackPluginRuntimeStrategy` configuration option added. |
