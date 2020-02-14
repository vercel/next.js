# Static export example

This example show how to export to static HTML files your Next.js application fetching data from an API to generate a dynamic list of pages.

When trying to run `npm start` it will build and export your pages into the `out` folder and serve them on `localhost:5000`.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-static-export with-static-export-app
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
