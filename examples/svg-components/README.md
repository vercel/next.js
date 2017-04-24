[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/svg-components)

# SVG components example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/svg-components
cd svg-components
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

This example uses a custom `.babelrc` to add support for importing `.svg` files and rendering them as React components. [babel-plugin-inline-react-svg](https://www.npmjs.com/package/babel-plugin-inline-react-svg) is used to handle transpiling the SVGs.
