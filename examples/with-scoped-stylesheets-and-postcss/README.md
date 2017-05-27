[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-scoped-stylesheets-and-postcss)
# Scoped stylesheets with PostCSS example

This is an example of using scoped stylesheets and PostCSS, heavily influenced by @davibe's [`with-global-stylesheet`](https://github.com/zeit/next.js/tree/master/examples/with-global-stylesheet).

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-scoped-stylesheets-and-postcss
cd with-scoped-stylesheets-and-postcss
```

To get this example running you must

    npm install .
    npm run dev

Visit [http://localhost:3000](http://localhost:3000) and try edit `pages/styles.css`. Your changes should be picked up instantly.

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

# Why

Scoped CSS is neat and keeps your JS clean. PostCSS is amazing for extended features, such as nesting. CSS Modules keep your class names “local”.

# Known bugs

There's a bug, possibly within `next.js`, making composition between files unuseable. Consider the following:

*`styles.css`*
```css
.paragraph {
  composes: font-sans from '../global.css';
}
```

*`global.css`*
```css
.font-sans {
  font-family: georgia; /* ;) */
}
```

The following error is thrown:

```
Module build failed: Error: Cannot find module '-!./../node_modules/css-loader/index.js??ref--6-4!./../node_modules/postcss-loader/index.js!../global.css'
```
