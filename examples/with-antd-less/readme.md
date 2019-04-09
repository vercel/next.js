### Less loader for next.js and Antd integration.

### 1. Example installation

for this example, you can use commands as follows:

```shell
yarn install
yarn dev
```

### 2. Project installation(for production project)

#### 1. first step, install loader package

```shell

// using yarn
yarn add next-antd-aza-less --save

// or use npm
npm install next-antd-aza-less --save

```

#### 2. second step, add .babelrc in your project

```json
{
  "presets": ["next/babel"],
  "plugins": [
    [
      "import",
      {
        "libraryName": "antd",
        "libraryDirectory": "lib",
        "style": true
      }
    ]
  ]
}
```

#### 3. change your .next.config.js

Example:

```javascript
const antdLessLoader = require("next-antd-aza-less");
const modifyVars = require("./your/custom/vars");

if (typeof require !== "undefined") {
  require.extensions[".less"] = file => {};
}

/* Without CSS Modules, with PostCSS */
module.exports = antdLessLoader({
  cssModules: true,
  cssLoaderOptions: {
    importLoaders: 1,
    localIdentName: "[local]___[hash:base64:5]"
  },
  lessLoaderOptions: {
    javascriptEnabled: true,
    modifyVars: modifyVars
  }
});
```
