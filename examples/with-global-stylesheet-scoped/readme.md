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
The idea behind this example is the use of css namespacing to solve scoping when you want to preserve all the css names and rules of a particular library to a component or a page.

With the help of postcss and postcss-selector-namespace, withStyles first generate a unique id for each component it wraps, and then use it as a namespace to the styles it receives. First it uses postcss to process and create namespace, then it uses the resulting css string and assign to a global style with styled-components's injectGlobal function.

SSR is done by having a component wide variable called `classNames` that aggregates all css namespaces that it collects from usages of withStyles throughout the app and add the list of classNames to _document.js body element during server rendering.

For performance reasons, `withStyles` is able to control scoping of styling with the lifecycle of components by adding or removing the appropriate css namespace from the body element. It also memoizes the style in the document throughout the session to improve performance instead of removing them as component unmount. I believe removing the actual style in the style tag as component come and go gives browser unnecessary repaint cycles.




### Caveats

1. Very easy to abuse styling with duplication of stylesheets (e.g. multiple items in a dynamic generated grid)
2. Not supporting hot reloading, as for why hot reloading wouldn't work in higher over component (because of higher over component proxy): https://medium.com/@dan_abramov/hot-reloading-in-react-1140438583bf
