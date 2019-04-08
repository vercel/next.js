# Static export example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-static-export with-static-export-app
# or
yarn create next-app --example with-static-export with-static-export-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-static-export
cd with-static-export
```

> This example requires [Node.js 8](https://nodejs.org/en/download/current/) or a later version.<br>
> (That's for the use of "async await" in the `next.config.js`.)

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## The idea behind the example

This example shows how to export a Next.js application as a collection of static pages even when the application does not know the data at compile time. This is a common scenario when data is time-sensitive, user-specific, or can't reliably be fetched from a build server. Even when data is readily available, some developers prefer to use the [App Shell Model](https://developers.google.com/web/fundamentals/architecture/app-shell), where your application bundle contains fully compiled, but empty, pages.

This application uses an Express server in development and a serve.json file for production to configure custom routing.

To run the static bundle, use `npm start` which will build and export your pages into the `out` folder and serve them on `localhost:5000`.
