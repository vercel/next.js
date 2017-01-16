# Example app with prefetching pages

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-prefetching
cd with-prefetching
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example features:

* An app with four simple pages
* The "about" page uses the imperative (i.e.: "manual") prefetching API to prefetch on hover
* It will prefetch all the pages in the background except the "contact" page
