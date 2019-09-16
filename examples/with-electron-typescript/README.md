# Electron with Typescript application example

**You can find a detailed documentation about how to build Electron apps with Next.js [here](https://leo.im/2017/electron-next)!**

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-electron-typescript with-electron-typescript-app
# or
yarn create next-app --example with-electron-typescript with-electron-typescript-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-electron-typescript
cd with-electron-typescript
```

To install and start dev build:

```bash
yarn install && yarn build && yarn start
```

Available commands:

```bash
"yarn build-renderer": build and transpile Next.js layer
"yarn build-electron": transpile electron layer
"yarn build": build both layers
"yarn start": start dev version
"yarn dist": create production elctron build
"yarn type-check": check TypeScript in project
```

## The idea behind the example

This example show how you can use Next.js inside an Electron application to avoid a lot of configuration, use Next.js router as view and use server-render to speed up the initial render of the application. Both Next.js and Electron layers are written in TypeScript and compiled to JavaScript during the build process.

| Part       | Source code (Typescript) | Builds (JavaScript) |
| ---------- | ------------------------ | ------------------- |
| Next.js    | `/renderer`              | `/renderer`         |
| Electron   | `/electron-src`          | `/main`             |
| Production |                          | `/dist`             |

For development it's going to run a HTTP server and let Next.js handle routing. In production it use `next export` to pre-generate HTML static files and use them in your app instead of running an HTTP server.

You can create the production app using `npm run dist`.

_note regarding types:_

- Electron provides its own type definitions, so you don't need @types/electron installed!
  source: https://www.npmjs.com/package/@types/electron
- There were no types available for `electron-next` at the time of creating this example, so until they are available there is a file `electron-next.d.ts` in `electron-src` directory.
