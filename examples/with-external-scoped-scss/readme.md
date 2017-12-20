# With external scoped scss
This example shows you how to load external scss files as styled-jsx.

![with-external-scoped-scss](https://i.imgur.com/w3ak2bm.gif)

1. First of all install all the dependencies:

`yarn add babel-loader node-sass sass-loader styled-jsx-css-loader --dev`

2. configure webpack:

```js
path = require('path')

module.exports = {
  webpack: (config, {dev}) => {
    config.module.rules.push({
      test: /\.scss$/,
      use: [
        {
          loader: "emit-file-loader",
          options: {
            name: "dist/[path][name].[ext].js"
          }
        },
        {
          loader: "babel-loader",
          options: {
            babelrc: false,
            extends: path.resolve(__dirname, "./.babelrc")
          }
        },
        "styled-jsx-css-loader",
        {
          loader: "sass-loader",
          options: {
            sourceMap: dev
          }
        }
      ]
    });

    return config;
  }
};
```
2. configure babel:

```js
{
  "presets": [
    [
      "next/babel",
      {
        "preset-env": {
          "modules": "commonjs"
        }
      }
    ]
  ]
}
```
3. create your styles:
```scss
h1 {
  background: red;
}
```

4. import styles in your components:
```js
import React from 'react'

import styles from './style.scss'

export default (props) => {
  return (
    <div>
      <style jsx>{styles}</style>
      <h1>Header with red background</h1>
    </div>
  )
}
```

## Acknowledgements
* [Eric Redon](https://github.com/coox) for [styled-jsx-scss-loader](https://github.com/coox/styled-jsx-css-loader)
* [Connor Bär](https://github.com/connor-baer) for showing how to configure scss in [this](https://github.com/coox/styled-jsx-css-loader/issues/6) issue
