# Electron application example

This example shows how you can use Next.js inside an Electron application to avoid a lot of configuration. It uses the Next.js router as view and server-render to speed up the initial render of the application.

For development it's going to run an HTTP server and let Next.js handle routing. In production it uses `next export` to pre-generate HTML static files and uses them in your app instead of running an HTTP server.

**You can find a detailed documentation about how to build Electron apps with Next.js [here](https://leo.im/2017/electron-next)!**

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-electron with-electron-app
# or
yarn create next-app --example with-electron with-electron-app
```

You can create the production app using `npm run dist`.
