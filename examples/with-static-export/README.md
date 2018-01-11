# Static export example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-static-export with-static-export-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

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
```

## The idea behind the example

This example show how to export to static HTML files your Next.js application fetching data from an API to generate a dynamic list of pages. This use a custom Express server in development to configure custom routing and then generate a map of pages to export for production.

When trying to run `npm start` it will build and export your pages into the `out` folder and serve them on `localhost:5000`.
