# Example app with dynamic-imports

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/v3-beta | tar -xz --strip=2 next.js-3-beta/examples/with-dynamic-import
cd with-dynamic-import
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

This examples shows how to dynamically import modules via [`import()`](https://github.com/tc39/proposal-dynamic-import) API
