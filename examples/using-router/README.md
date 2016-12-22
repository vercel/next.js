# Example app utilizing next/router for routing

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/using-router
cd using-router
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/using-router
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

* An app linking pages using `next/router` instead of `<Link>` component.
* Access the pathname using `next/router` and render it in a component
