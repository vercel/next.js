# Static export example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-static-export
cd with-static-export
```

> This example requires [Node.js 8](https://nodejs.org/en/download/current/) or a later version.
> (That's for the use of "async await" in the `next.config.js`.)

Install it and run:

```bash
npm install
npm run dev
```

## The idea behind the example

This example show how to export to static HTML files your Next.js application fetching data from an API to generate a dynamic list of pages. This use a custom Express server in development to configure custom routing and then generate a map of pages to export for production.

When trying to run `npm start` it will build and export your pages into the `out` folder and serve them on `localhost:5000`.
