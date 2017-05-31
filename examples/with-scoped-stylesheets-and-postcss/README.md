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

# Known issues

Composed CSS files are not watched by next.js, and thus, if you change one, nothing will happen. You'll need to edit a JS file or the CSS file you're composing for it to hot reload.
