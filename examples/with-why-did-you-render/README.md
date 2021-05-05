# Why did you render

This is a simple example of how to use [why-did-you-render](https://github.com/welldone-software/why-did-you-render).

The header component will rerender despite the state staying the same.

You can see `why-did-you-render` console logs about this redundant re-render in the developer console.

## Installation guide

1. add `why-did-you-render` to the project by running:

   ```
   yarn add @welldone-software/why-did-you-render
   ```

1. Create `scripts/wdyr.js` with the code:

   ```jsx
   import React from 'react'

   if (process.env.NODE_ENV === 'development') {
     if (typeof window !== 'undefined') {
       const whyDidYouRender = require('@welldone-software/why-did-you-render')
       whyDidYouRender(React, {
         trackAllPureComponents: true,
       })
     }
   }
   ```

1. Import `scripts/wdyr.js` as the first import of `_app`.

1. Make sure that [`react-preset`](https://babeljs.io/docs/en/babel-preset-react) uses `@welldone-software/why-did-you-render` to import the monkey patched `React` with WDYR, by modifying `next/babel` in `babel.config.js`:

```jsx
// babel.config.js
module.exports = function (api) {
  const isServer = api.caller((caller) => caller?.isServer)
  const isCallerDevelopment = api.caller((caller) => caller?.isDev)

  const presets = [
    [
      'next/babel',
      {
        'preset-react': {
          importSource:
            !isServer && isCallerDevelopment
              ? '@welldone-software/why-did-you-render'
              : 'react',
        },
      },
    ],
  ]

  return { presets }
}
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-why-did-you-render&project-name=with-why-did-you-render&repository-name=with-why-did-you-render)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-why-did-you-render with-why-did-you-render-app
# or
yarn create next-app --example with-why-did-you-render with-why-did-you-render-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
