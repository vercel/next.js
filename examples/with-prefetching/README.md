# Example app with prefetching pages

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz next.js-master/examples/with-prefetching
cd next.js-master/examples/with-prefetching
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/with-prefetching
```

Install the dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

## The idea behind the example

This example features:

* An app with four simple pages
* The "about" page uses the imperative (i.e.: "manual") prefetching API to prefetch on hover
* It will prefetch all the pages in the background except the "contact" page
