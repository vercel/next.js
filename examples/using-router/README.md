# Example app utilizing next/router for routing

## How to use

Download the example (or clone the repo)[https://github.com/zeit/next.js.git]:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/using-router
cd using-router
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

* An app linking pages using `next/router` instead of `<Link>` component.
* Access the pathname using `next/router` and render it in a component
