---
description: Learn about the Rust Compiler, built with SWC, which transforms and minifies your Next.js application.
---

# Rust Compiler

<details open>
  <summary><b>Version History</b></summary>

| Version   | Changes                                                      |
| --------- | ------------------------------------------------------------ |
| `v12.0.0` | Rust Compiler [introduced](https://nextjs.org/blog/next-12). |

</details>

The Rust Compiler for Next.js, built with [SWC](http://swc.rs/), allows Next.js to transform and minify your JavaScript code for production. This replaces Babel for individual files and Terser for minifying output bundles.

Compilation using the Rust Compiler is 17x faster than Babel and enabled by default using Next.js 12. If you have an existing Babel configuration or are using [unsupported features](#unsupported-features), your application will opt-out of the Rust Compiler and continue using Babel.

## Why SWC?

[SWC](http://swc.rs/) is an extensible Rust-based platform for the next generation of fast developer tools.

SWC can be used for compilation, minification, bundling, and more – and is designed to be extended. It's something you can call to perform code transformations (either built-in or custom). Running those transformations happens through higher-level tools like Next.js.

We chose to build on SWC for a few reasons:

- **Extensibility:** SWC can be used as a Crate inside Next.js, without having to fork the library or workaround design constraints.
- **Performance:** We were able to achieve ~3x faster Fast Refresh and ~5x faster builds in Next.js by switching to SWC, with more room for optimization still in progress.
- **WebAssembly:** Rust's support for WASM is essential for supporting all possible platforms and taking Next.js development everywhere.
- **Community:** The Rust community and ecosystem are amazing and only growing.

## Supported Features

All custom code transformations Next.js uses are supported by the Rust Compiler:

- `getStaticProps`
- `getStaticPaths`
- `getServerSideProps`
- `styled-jsx`
- CSS Modules
- Sass

## Experimental Features

### Minification

You can opt-in to using the Rust compiler for minification. This is 7x faster than Terser.

```js
// next.config.js

module.exports = {
  swcMinify: true,
}
```

### Styled Components

We're working to port `babel-plugin-styled-components` to use the Rust compiler. Currently, only the `ssr` and `displayName` options are enabled by default.

First, update to the canary version of Next.js: `npm install next@canary`. Then, update your `next.config.js` file:

```js
// next.config.js

module.exports = {
  experimental: {
    // ssr and displayName are configured by default
    styledComponents: true,
  },
}
```

### Jest

Jest support not only includes the transformation previously provided by Babel, but also simplifies configuring Jest together with Next.js including:

- Auto mocking of `.css`, `.module.css` (and their `.scss` variants), and image imports
- Automatically sets up `transform` using SWC
- Loading `.env` (and all variants) into `process.env`
- Ignores `node_modules` from test resolving and transforms
- Ignoring `.next` from test resolving
- Loads `next.config.js` for flags that enable experimental SWC transforms

First, update to the canary version of Next.js: `npm install next@canary`. Then, update your `jest.config.js` file:

```js
// jest.config.js
const nextJest = require('next/jest')

// Providing the path to your Next.js app which will enable loading next.config.js and .env files
const createJestConfig = nextJest({ dir })

// Any custom config you want to pass to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}

// createJestConfig is exported in this way to ensure that next/jest can load the Next.js configuration, which is async
module.exports = createJestConfig(customJestConfig)
```

### Legacy Decorators

Next.js will automatically detect `experimentalDecorators` in `jsconfig.json` or `tsconfig.json` and apply that. This is commonly used with libraries like `mobx`. This is only added for compatibility with existing apps. We do not recommend using legacy decorators in new apps.

First, update to the canary version of Next.js: `npm install next@canary`. Then, update your `jsconfig.json` or `tsconfig.json` file:

```js
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

### importSource

Next.js will automatically detect `jsxImportSource` in `jsconfig.json` or `tsconfig.json` and apply that. This is commonly used with libraries like Theme UI.

First, update to the canary version of Next.js: `npm install next@canary`. Then, update your `jsconfig.json` or `tsconfig.json` file:

```js
{
  "compilerOptions": {
    "jsxImportSource": true
  }
}
```

## Unsupported Features

- [Emotion](https://github.com/vercel/next.js/issues/30804)
- [Relay](https://github.com/vercel/next.js/issues/30805)
- [transform-remove-console](https://github.com/vercel/next.js/issues/31332)
- [react-remove-properties](https://github.com/vercel/next.js/issues/31333)

If you're using a custom Babel setup, [please share your configuration](https://github.com/vercel/next.js/discussions/30174). We're working to port as many commonly used Babel transformations as possible, as well as supporting plugins in the future.
