---
title: output
description: Next.js automatically traces which files are needed by each page to allow for easy deployment of your application. Learn how it works here.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

During a build, Next.js will automatically trace each page and its dependencies to determine all of the files that are needed for deploying a production version of your application.

This feature helps reduce the size of deployments drastically. Previously, when deploying with Docker you would need to have all files from your package's `dependencies` installed to run `next start`. Starting with Next.js 12, you can leverage Output File Tracing in the `.next/` directory to only include the necessary files.

Furthermore, this removes the need for the deprecated `serverless` target which can cause various issues and also creates unnecessary duplication.

## How it Works

During `next build`, Next.js will use [`@vercel/nft`](https://github.com/vercel/nft) to statically analyze `import`, `require`, and `fs` usage to determine all files that a page might load.

Next.js' production server is also traced for its needed files and output at `.next/next-server.js.nft.json` which can be leveraged in production.

To leverage the `.nft.json` files emitted to the `.next` output directory, you can read the list of files in each trace that are relative to the `.nft.json` file and then copy them to your deployment location.

## Automatically Copying Traced Files

Next.js can automatically create a `standalone` folder that copies only the necessary files for a production deployment including select files in `node_modules`.

To leverage this automatic copying you can enable it in your `next.config.js`:

```js filename="next.config.js"
module.exports = {
  output: 'standalone',
}
```

This will create a folder at `.next/standalone` which can then be deployed on its own without installing `node_modules`.

Additionally, a minimal `server.js` file is also output which can be used instead of `next start`. This minimal server does not copy the `public` or `.next/static` folders by default as these should ideally be handled by a CDN instead, although these folders can be copied to the `standalone/public` and `standalone/.next/static` folders manually, after which `server.js` file will serve these automatically.

To copy these manually, you can use the `cp` command-line tool after you `next build`:

```bash filename="Terminal"
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
```

To start your minimal `server.js` file locally, run the following command:

```bash filename="Terminal"
node .next/standalone/server.js
```

<AppOnly>

> **Good to know**:
>
> - If your project needs to listen to a specific port or hostname, you can define `PORT` or `HOSTNAME` environment variables before running `server.js`. For example, run `PORT=8080 HOSTNAME=0.0.0.0 node server.js` to start the server on `http://0.0.0.0:8080`.

</AppOnly>

<PagesOnly>

> **Good to know**:
>
> - `next.config.js` is read during `next build` and serialized into the `server.js` output file.
> - If your project needs to listen to a specific port or hostname, you can define `PORT` or `HOSTNAME` environment variables before running `server.js`. For example, run `PORT=8080 HOSTNAME=0.0.0.0 node server.js` to start the server on `http://0.0.0.0:8080`.

</PagesOnly>

## Caveats

- While tracing in monorepo setups, the project directory is used for tracing by default. For `next build packages/web-app`, `packages/web-app` would be the tracing root and any files outside of that folder will not be included. To include files outside of this folder you can set `outputFileTracingRoot` in your `next.config.js`.

```js filename="packages/web-app/next.config.js"
const path = require('path')

module.exports = {
  // this includes files from the monorepo base two directories up
  outputFileTracingRoot: path.join(__dirname, '../../'),
}
```

- There are some cases in which Next.js might fail to include required files, or might incorrectly include unused files. In those cases, you can leverage `outputFileTracingExcludes` and `outputFileTracingIncludes` respectively in `next.config.js`. Each option accepts an object whose keys are **route globs** (matched with [picomatch](https://www.npmjs.com/package/picomatch#basic-globbing) against the route path, e.g. `/api/hello`) and whose values are **glob patterns resolved from the project root** that specify files to include or exclude in the trace.

> **Good to know**:
> In a monorepo, `project root` refers to the Next.js project root (the folder containing next.config.js, e.g., packages/web-app), not necessarily the monorepo root.

```js filename="next.config.js"
module.exports = {
  outputFileTracingExcludes: {
    '/api/hello': ['./un-necessary-folder/**/*'],
  },
  outputFileTracingIncludes: {
    '/api/another': ['./necessary-folder/**/*'],
    '/api/login/\\[\\[\\.\\.\\.slug\\]\\]': [
      './node_modules/aws-crt/dist/bin/**/*',
    ],
  },
}
```

Using a `src/` directory does not change how you write these options:

- **Keys** still match the route path (`'/api/hello'`, `'/products/[id]'`, etc.).
- **Values** can reference paths under `src/` since they are resolved relative to the project root.

```js filename="next.config.js"
module.exports = {
  outputFileTracingIncludes: {
    '/products/*': ['src/lib/payments/**/*'],
    '/*': ['src/config/runtime/**/*.json'],
  },
  outputFileTracingExcludes: {
    '/api/*': ['src/temp/**/*', 'public/large-logs/**/*'],
  },
}
```

You can also target all routes using a global key like `'/*'`:

```js filename="next.config.js"
module.exports = {
  outputFileTracingIncludes: {
    '/*': ['src/i18n/locales/**/*.json'],
  },
}
```

These options are applied to server traces and do not affect routes that do not produce a server trace file:

- Edge Runtime routes are not affected.
- Fully static pages are not affected.

In monorepos or when you need to include files outside the app folder, combine `outputFileTracingRoot` with includes:

```js filename="next.config.js"
const path = require('path')

module.exports = {
  // Trace from the monorepo root
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    '/route1': ['../shared/assets/**/*'],
  },
}
```

> **Good to know**:
>
> - Prefer forward slashes (`/`) in patterns for cross-platform compatibility.
> - Keep patterns as narrow as possible to avoid oversized traces (avoid `**/*` at the repo root).

Common include patterns for native/runtime assets:

```js filename="next.config.js"
module.exports = {
  outputFileTracingIncludes: {
    '/*': ['node_modules/sharp/**/*', 'node_modules/aws-crt/dist/bin/**/*'],
  },
}
```
