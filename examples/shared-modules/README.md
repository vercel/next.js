# Example app using shared modules

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz next.js-master/examples/shared-modules
cd next.js-master/examples/shared-modules
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/shared-modules
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

* An app with two pages which has a common Counter component
* That Counter component maintain the counter inside its module. This is used primarily to illustrate that modules get initialized once and their state variables persist in runtime
