[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-global-stylesheet-scoped)

# With Global Stylesheet Scoped example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-global-stylesheet-scoped
cd with-global-stylesheet-scoped
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

This example is heavily inspired by with-global-stylesheet example.
This example shows the idea of importing and using any kinds of global stylesheet scoped to each component's lifecycle. By using postcss postcssJs and postcss-selector-namespace, we can collect and transform the stylsheet into a style tag with component based namespace, then one can easily add / remove style to individual component when they depends on a global stylesheet by using the withStyles hoc helper. Feel free to improvise withStyles.



### Caveats

If someone can provide pull request to solve the issues below that would be really appreciated!

1. Possible duplication of stylesheets as multiple components can import the same stylesheets
2. Async nature of postcss makes it hard to do SSR properly
3. Not supporting hot reloading atm
