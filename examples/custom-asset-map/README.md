# Example app using custom `assetMap`

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/custom-asset-map
cd custom-asset-map
```

Install it and run as production:

```bash
npm install
npm run build
npm run start
```

## The idea behind the example

To illustrate usage of `assetMap` option, which allows next.js apps to work with S3 (or alike) based CDNs
