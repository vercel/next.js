[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-externals)
# Example app with added support for `npm link`-ed local packages

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-externals
cd with-externals
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

* A custom next.config.js to have Webpack process any node_modules of a certain scope as if it were local (untranspiled) code
* Have webpack-dev-server properly track any changes in `npm link`ed node_modules so HMR will work for these packages as well

The example does not feature the actual external package. You'll have to create one yourself and use `npm link` to try it out.
Note that you'll need to modify `next.config.js` with your own npm scope name.

## How to run it

```sh
npm install
npm run dev
```
