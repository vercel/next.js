# Monaco Editor Example

A next.js app with monaco-editor. This works for both App router and Pages router (the example only uses app router, but pages router should be very similar).

Keep in mind that in the development environment, the browser can load more than 10MB of data per request (depends on how many languages are enabled in next.config.mjs). In production the bundle size is much smaller.

If you enable turbopack, there will be some incompability issues (the browser will throw errors/warnings). The language workers will not be created and it will fall back to loading web worker code in main thread, which might cause UI freezes.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/monaco-editor&project-name=monaco-editor&repository-name=monaco-editor)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example monaco-editor monaco-editor-app
```

```bash
yarn create next-app --example monaco-editor monaco-editor-app
```

```bash
pnpm create next-app --example monaco-editor monaco-editor-app
```

```bash
bunx create-next-app --example monaco-editor monaco-editor-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
