[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-global-stylesheet-simple)

## Global Stylesheet Example (Simple Version - CSS inside `node_modules`)

This is an example of importing a CSS file located inside `node_modules` (ones you downloaded using `npm` or `yarn`).

This would be useful for importing CSS libraries such as [`normalize.css`](https://necolas.github.io/normalize.css/).

### What if I want to import my own CSS, such as `styles/foo.css`?

Check out the [with-global-stylesheet](../with-global-stylesheet) example.

### How It Works

- Install `babel-plugin-inline-import` using `npm` or `yarn`
- Then, add this to your `.babelrc`:

```js
{
  "plugins": [
    [
      "inline-import",
      {
        "extensions": [".css"]
      }
    ]
  ],
  "presets": ["next/babel"],
  "ignore": []
}
```

- Install any CSS library using `npm` or `yarn`. In this example, I installed [`tachyons`](http://tachyons.io/).
- Import the CSS file. Here, I'm importing a CSS file located at `node_modules/tachyons/css/tachyons.min.css`.

```js
import tachyons from 'tachyons/css/tachyons.min.css'
```

- Add it globally using `styled-jsx`:

```js
<style jsx global>{tachyons}</style>
```

### Result ([`index.js`](pages/index.js)):

![](example.png)
