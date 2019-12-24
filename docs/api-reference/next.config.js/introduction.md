# next.config.js

For custom advanced behavior of Next.js, you can create a `next.config.js` in the root of your project directory (next to `package.json`).

`next.config.js` is a regular Node.js module, not a JSON file. It gets used by the Next.js server and build phases, and it's not included in the browser build.

Take a look at the following `next.config.js` example:

```js
module.exports = {
  /* config options here */
}
```

You can also use a function:

```js
module.exports = (phase, { defaultConfig }) => {
  return {
    /* config options here */
  }
}
```

`phase` is the current context in which the configuration is loaded. You can see the available phases [here](https://github.com/zeit/next.js/blob/canary/packages/next/next-server/lib/constants.ts#L1-L4). Phases can be imported from `next/constants`:

```js
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

module.exports = (phase, { defaultConfig }) => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      /* development only config options here */
    }
  }

  return {
    /* config options for all phases except development here */
  }
}
```

The commented lines are the place where you can put the configs allowed by `next.config.js`, which are defined [here](https://github.com/zeit/next.js/blob/canary/packages/next/next-server/server/config.ts#L12-L63).

However, none of the configs are required, and it's not necessary to understand what each config does, instead, search for the features you need to enable or modify in this section and they will show you what to do.

> Avoid using new JavaScript features not available in your target Node.js version. `next.config.js` will not be parsed by Webpack, Babel or TypeScript.
