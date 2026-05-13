---
title: Turbopack
description: Turbopack is an incremental bundler optimized for JavaScript and TypeScript, written in Rust, and built into Next.js.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Turbopack is an **incremental bundler** optimized for JavaScript and TypeScript, written in Rust, and built into **Next.js**. You can use Turbopack with both the Pages and App Router for a **much faster** local development experience.

## Why Turbopack?

We built Turbopack to push the performance of Next.js, including:

- **Unified Graph:** Next.js supports multiple output environments (e.g., client and server). Managing multiple compilers and stitching bundles together can be tedious. Turbopack uses a **single, unified graph** for all environments.
- **Bundling vs Native ESM:** Some tools skip bundling in development and rely on the browser's native ESM. This works well for small apps but can slow down large apps due to excessive network requests. Turbopack **bundles** in dev, but in an optimized way to keep large apps fast.
- **Incremental Computation:** Turbopack parallelizes work across cores and **caches** results down to the function level. Once a piece of work is done, Turbopack won’t repeat it.
- **Lazy Bundling:** Turbopack only bundles what is actually requested by the dev server. This lazy approach can reduce initial compile times and memory usage.

## Supported platforms

Turbopack requires platform-specific native bindings. The following platforms are currently supported:

| Platform       | Architecture |
| -------------- | ------------ |
| macOS (Darwin) | x64, ARM64   |
| Windows        | x64, ARM64   |
| Linux (glibc)  | x64, ARM64   |
| Linux (musl)   | x64, ARM64   |

On platforms without native bindings (e.g. FreeBSD, OpenBSD), Next.js falls back to WebAssembly (WASM) bindings. WASM bindings support core SWC features like compilation and minification, but **do not support Turbopack**. On these platforms, use the `--webpack` flag:

```bash
next dev --webpack
next build --webpack
```

## Getting started

Turbopack is now the **default bundler** in Next.js. No configuration is needed to use Turbopack:

```json filename="package.json" highlight={3}
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

### Using Webpack instead

If you need to use Webpack instead of Turbopack, you can opt-in with the `--webpack` flag:

```json filename="package.json"
{
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start"
  }
}
```

## Supported features

Turbopack in Next.js has **zero-configuration** for the common use cases. Below is a summary of what is supported out of the box, plus some references to how you can configure Turbopack further when needed.

### Language features

| Feature                     | Status        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JavaScript & TypeScript** | **Supported** | Uses SWC under the hood. Type-checking is not done by Turbopack (run `tsc --watch` or rely on your IDE for type checks).                                                                                                                                                                                                                                                                                                |
| **ECMAScript (ESNext)**     | **Supported** | Turbopack supports the latest ECMAScript features, matching SWC’s coverage.                                                                                                                                                                                                                                                                                                                                             |
| **CommonJS**                | **Supported** | `require()` syntax is handled out of the box.                                                                                                                                                                                                                                                                                                                                                                           |
| **ESM**                     | **Supported** | Static and dynamic `import` are fully supported.                                                                                                                                                                                                                                                                                                                                                                        |
| **Babel**                   | **Supported** | Starting in Next.js 16, Turbopack uses Babel automatically if it detects [a configuration file][babel-config]. Unlike in webpack, SWC is always used for Next.js's internal transforms and downleveling to older ECMAScript revisions. Next.js with webpack disables SWC if a Babel configuration file is present. Files in `node_modules` are excluded, unless you [manually configure `babel-loader`][manual-loader]. |

[babel-config]: https://babeljs.io/docs/config-files
[manual-loader]: /docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders

### Framework and React features

| Feature                           | Status        | Notes                                                                                                                  |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **JSX / TSX**                     | **Supported** | SWC handles JSX/TSX compilation.                                                                                       |
| **Fast Refresh**                  | **Supported** | No configuration needed.                                                                                               |
| **React Server Components (RSC)** | **Supported** | For the Next.js App Router. Turbopack ensures correct server/client bundling.                                          |
| **Root layout creation**          | Unsupported   | Automatic creation of a root layout in App Router is not supported. Turbopack will instruct you to create it manually. |

### CSS and styling

| Feature            | Status                  | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global CSS**     | **Supported**           | Import `.css` files directly in your application.                                                                                                                                                                                                                                                                                                                     |
| **CSS Modules**    | **Supported**           | `.module.css` files work natively (Lightning CSS).                                                                                                                                                                                                                                                                                                                    |
| **CSS Nesting**    | **Supported**           | Lightning CSS supports [modern CSS nesting](https://lightningcss.dev/).                                                                                                                                                                                                                                                                                               |
| **@import syntax** | **Supported**           | Combine multiple CSS files.                                                                                                                                                                                                                                                                                                                                           |
| **PostCSS**        | **Supported**           | Automatically processes PostCSS config files (`postcss.config.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`) in a Node.js worker pool. Useful for Tailwind, Autoprefixer, etc.                                                                                                                                                                                           |
| **Sass / SCSS**    | **Supported** (Next.js) | For Next.js, Sass is supported out of the box. Custom Sass functions (`sassOptions.functions`) are not supported because Turbopack's Rust-based architecture cannot directly execute JavaScript functions, unlike webpack's Node.js environment. Use webpack if you need this feature. In the future, Turbopack standalone usage will likely require a loader config. |
| **Less**           | Planned via plugins     | Not yet supported by default. Will likely require a loader config once custom loaders are stable.                                                                                                                                                                                                                                                                     |
| **Lightning CSS**  | **In Use**              | Handles CSS transformations. Some low-usage CSS Modules features (like `:local/:global` as standalone pseudo-classes) are not yet supported. [See below for more details.](#unsupported-and-unplanned-features)                                                                                                                                                       |

### Assets

| Feature                           | Status        | Notes                                                                                                                      |
| --------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Static Assets** (images, fonts) | **Supported** | Importing `import img from './img.png'` works out of the box. In Next.js, returns an object for the `<Image />` component. |
| **JSON Imports**                  | **Supported** | Named or default imports from `.json` are supported.                                                                       |

### Module resolution

| Feature               | Status              | Notes                                                                                                                                                           |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path Aliases**      | **Supported**       | Reads `tsconfig.json`'s `paths` and `baseUrl`, matching Next.js behavior.                                                                                       |
| **Manual Aliases**    | **Supported**       | [Configure `resolveAlias` in `next.config.js`](/docs/app/api-reference/config/next-config-js/turbopack#resolving-aliases) (similar to `webpack.resolve.alias`). |
| **Custom Extensions** | **Supported**       | [Configure `resolveExtensions` in `next.config.js`](/docs/app/api-reference/config/next-config-js/turbopack#resolving-custom-extensions).                       |
| **AMD**               | Partially Supported | Basic transforms work; advanced AMD usage is limited.                                                                                                           |

### Performance and Fast Refresh

| Feature                  | Status        | Notes                                                                                    |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| **Fast Refresh**         | **Supported** | Updates JavaScript, TypeScript, and CSS without a full refresh.                          |
| **Incremental Bundling** | **Supported** | Turbopack lazily builds only what's requested by the dev server, speeding up large apps. |

### Magic Comments

Turbopack supports webpack-compatible magic comments for controlling import behavior. These comments work with dynamic `import()`, `require()`, `require.resolve()`, and `new Worker()` expressions (not static `import` statements).

| Comment                   | Webpack | Turbopack | Description                    |
| ------------------------- | ------- | --------- | ------------------------------ |
| `webpackIgnore: true`     | ✓       | ✓         | Skip bundling, preserve import |
| `turbopackIgnore: true`   | ✗       | ✓         | Skip bundling (Turbopack-only) |
| `turbopackOptional: true` | ✗       | ✓         | Suppress resolve errors        |
| `webpackOptional: true`   | ✗       | ✗         | Not supported                  |

See [Lazy Loading](/docs/app/guides/lazy-loading#magic-comments) for usage examples.

## import.meta.glob

Turbopack supports `import.meta.glob()`, a Vite-compatible API for importing multiple modules at once using glob patterns. The result is an object keyed by the file path relative to the calling file.

```js
const modules = import.meta.glob('./dir/*.js')
// {
//   './dir/foo.js': () => import('./dir/foo.js'),
//   './dir/bar.js': () => import('./dir/bar.js'),
// }
```

> **Good to know:** `import.meta.glob` requires Turbopack. It is not available when using webpack.

### Lazy loading (default)

By default, each value in the result object is a thunk — a function that returns a `Promise` for the module. This enables lazy loading:

```js
const modules = import.meta.glob('./dir/*.js')

for (const path in modules) {
  const module = await modules[path]()
  console.log(path, module)
}
```

### Eager loading

Pass `{ eager: true }` to import all matching modules up front. Each value is the module object directly instead of a thunk:

```js
const modules = import.meta.glob('./dir/*.js', { eager: true })

for (const path in modules) {
  console.log(path, modules[path].default)
}
```

### Named imports

Use the `import` option to select a specific named export from each matched module. This works in both lazy and eager modes:

```js
// Lazy: each value is () => Promise<exportValue>
const defaults = import.meta.glob('./dir/*.js', { import: 'default' })

// Eager: each value is the export value directly
const setups = import.meta.glob('./dir/*.js', { import: 'setup', eager: true })
```

### Query strings

Use the `query` option to append a query string to every import request. This is useful for loading files as raw strings or URLs:

```js
const rawFiles = import.meta.glob('./dir/*.txt', { query: '?raw' })
const urls = import.meta.glob('./dir/*.png', { query: '?url' })
```

The `query` option also accepts an object. Keys and values are URL-encoded and joined into a query string:

```js
const modules = import.meta.glob('./*.ts', {
  query: { bar: 'foo', raw: true },
})
// equivalent to: { query: '?bar=foo&raw=true' }
```

### Multiple patterns and negation

Pass an array of glob patterns as the first argument. Prefix a pattern with `!` to exclude matching files:

```js
// Combine multiple directories
const modules = import.meta.glob(['./dir/*.js', './other/*.js'])

// Exclude specific files
const withoutTests = import.meta.glob(['./src/**/*.js', '!**/*.test.js'])
```

### TypeScript

TypeScript types for `import.meta.glob` are included in Next.js. They are available automatically when `"moduleResolution": "bundler"` (or `"node16"` / `"nodenext"`) is set in your `tsconfig.json`, which is the default for new Next.js projects.

The return type differs based on the `eager` option:

```ts
// Lazy (default) — Record<string, () => Promise<unknown>>
const lazy = import.meta.glob('./dir/*.ts')

// Eager — Record<string, unknown>
const eager = import.meta.glob('./dir/*.ts', { eager: true })
```

### Options reference

| Option   | Type                                          | Default     | Description                                                            |
| -------- | --------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| `eager`  | `boolean`                                     | `false`     | Import modules synchronously instead of returning thunks.              |
| `import` | `string`                                      | `undefined` | Named export to select from each matched module (e.g. `'default'`).    |
| `query`  | `string \| Record<string, string \| boolean>` | `undefined` | Query string (or object) to append to each import.                     |
| `base`   | `string`                                      | `undefined` | Override the base path used for resolving patterns and keying results. |

> **Note:** The `as` option (deprecated in Vite 5) is not supported. Use `query: '?raw'` or `query: '?url'` instead. The legacy `import.meta.globEager()` API is also not supported — use `import.meta.glob('...', { eager: true })` instead.

## Known gaps with webpack

There are a number of non-trivial behavior differences between webpack and Turbopack that are important to be aware of when migrating an application. Generally, these are less of a concern for new applications.

### Filesystem Root

Turbopack uses the root directory to resolve modules. Files outside of the project root are not resolved.

For example, when linking dependencies outside the project root (via `npm link`, `yarn link`, `pnpm link`, etc.), those linked files will not be resolved by default. To resolve these files, you must configure the root option to the parent directory of both the project and the linked dependencies.

You can configure the filesystem root using [turbopack.root](/docs/app/api-reference/config/next-config-js/turbopack#root-directory) option in `next.config.js`.

### CSS Module Ordering

Turbopack will follow JS import order to order [CSS modules](/docs/app/getting-started/css#css-modules) which are not otherwise ordered. For example:

```jsx filename="components/BlogPost.jsx"
import utilStyles from './utils.module.css'
import buttonStyles from './button.module.css'
export default function BlogPost() {
  return (
    <div className={utilStyles.container}>
      <button className={buttonStyles.primary}>Click me</button>
    </div>
  )
}
```

In this example, Turbopack will ensure that `utils.module.css` will appear before `button.module.css` in the produced CSS chunk, following the import order

Webpack generally does this as well, but there are cases where it will ignore JS inferred ordering, for example if it infers the JS file is side-effect-free.

This can lead to subtle rendering changes when adopting Turbopack, if applications have come to rely on an arbitrary ordering. Generally, the solution is easy, e.g. have `button.module.css` `@import utils.module.css` to force the ordering, or identify the conflicting rules and change them to not target the same properties.

### Sass node_modules imports

Turbopack supports importing `node_modules` Sass files out of the box. Webpack supports a legacy tilde `~` syntax for this, which is not supported by Turbopack.

From:

```scss filename="styles/globals.scss"
@import '~bootstrap/dist/css/bootstrap.min.css';
```

To:

```scss filename="styles/globals.scss"
@import 'bootstrap/dist/css/bootstrap.min.css';
```

If you can't update the imports, you can add a `turbopack.resolveAlias` configuration to map the `~` syntax to the actual path:

```js filename="next.config.js"
module.exports = {
  turbopack: {
    resolveAlias: {
      '~*': '*',
    },
  },
}
```

### CSS / Sass / SCSS decimal precision

Turbopack uses [Lightning CSS](https://lightningcss.dev/) to compile CSS. Lightning CSS uses 5 digits of decimal precision for numeric CSS values, while webpack uses 10 digits. This applies to both plain CSS and Sass/SCSS output. For example, a value that evaluates to `25/17` produces:

- **Webpack:** `line-height: 1.4705882353` (10 digits)
- **Turbopack:** `line-height: 1.47059` (5 digits)

This can lead to subtle rendering differences when migrating from webpack to Turbopack, especially for properties like `line-height`, `letter-spacing`, or other calculated values where high precision matters.

### Build Caching

Webpack supports [disk build caching](https://webpack.js.org/configuration/cache/#cache) to improve build performance. Turbopack provides a similar feature, currently in beta. Starting with Next 16, you can enable Turbopack’s filesystem cache by setting the following experimental flags:

- [`experimental.turbopackFileSystemCacheForDev`](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache) is enabled by default
- [`experimental.turbopackFileSystemCacheForBuild`](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache) is currently opt-in

> **Good to know:** For this reason, when comparing webpack and Turbopack performance, make sure to delete the `.next` folder between builds to see a fair cold build comparison or enable the turbopack filesystem cache feature to compare warm builds.

### Webpack plugins

Turbopack does not support webpack plugins. This affects third-party tools that rely on webpack's plugin system for integration. We do support [webpack loaders](/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders). If you depend on webpack plugins, you'll need to find Turbopack-compatible alternatives or continue using webpack until equivalent functionality is available.

## Unsupported and unplanned features

Some features are not yet implemented or not planned:

- **Legacy CSS Modules features**
  - Standalone `:local` and `:global` pseudo-classes (only the function variant `:global(...)` is supported).
  - The `@value` rule (superseded by CSS variables).
  - `:import` and `:export` ICSS rules.
  - `composes` in `.module.css` composing a `.css` file. In webpack this would treat the `.css` file as a CSS Module, with Turbopack the `.css` file will always be global. This means that if you want to use `composes` in a CSS Module, you need to change the `.css` file to a `.module.css` file.
  - `@import` in CSS Modules importing `.css` as a CSS Module. In webpack this would treat the `.css` file as a CSS Module, with Turbopack the `.css` file will always be global. This means that if you want to use `@import` in a CSS Module, you need to change the `.css` file to a `.module.css` file.
- **`sassOptions.functions`**
  Custom Sass functions defined in `sassOptions.functions` are not supported. This feature allows defining JavaScript functions that can be called from Sass code during compilation. Turbopack's Rust-based architecture cannot directly execute JavaScript functions passed through `sassOptions.functions`, unlike webpack's Node.js-based sass-loader which runs entirely in JavaScript. If you're using custom Sass functions, you'll need to use webpack instead of Turbopack.
- **`webpack()` configuration** in `next.config.js`
  Turbopack replaces webpack, so `webpack()` configs are not recognized. Use the [`turbopack` config](/docs/app/api-reference/config/next-config-js/turbopack) instead.
- **Yarn PnP**
  Not planned for Turbopack support in Next.js.
- **`experimental.urlImports`**
  Not planned for Turbopack.
- **`experimental.esmExternals`**
  Not planned. Turbopack does not support the legacy `esmExternals` configuration in Next.js.
- **Some Next.js Experimental Flags**
  - `experimental.nextScriptWorkers`
  - `experimental.fallbackNodePolyfills`
    We plan to implement these in the future.

For a full, detailed breakdown of each feature flag and its status, see the [Turbopack API Reference](/docs/app/api-reference/config/next-config-js/turbopack).

## Configuration

Turbopack can be configured via `next.config.js` (or `next.config.ts`) under the `turbopack` key. Configuration options include:

- **`rules`**
  Define additional [webpack loaders](/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders) for file transformations.
- **`resolveAlias`**
  Create manual aliases (like `resolve.alias` in webpack).
- **`resolveExtensions`**
  Change or extend file extensions for module resolution.
- **[`ignoreIssue`](/docs/app/api-reference/config/next-config-js/turbopackIgnoreIssue)**
  Suppress specific Turbopack errors and warnings from the CLI output and error overlay.

Additionally, the following experimental options are available under `experimental` in `next.config.js`:

| Option                                                                                                       | Description                                                                                                                                  | Default (dev) | Default (build)               |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- |
| [`turbopackFileSystemCacheForDev`](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache)   | Enable filesystem cache for the dev server.                                                                                                  | `true`        | N/A                           |
| [`turbopackFileSystemCacheForBuild`](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache) | Enable filesystem cache for builds.                                                                                                          | N/A           | `false`                       |
| `turbopackMinify`                                                                                            | Enable minification.                                                                                                                         | `false`       | `true`                        |
| `turbopackSourceMaps`                                                                                        | Enable source maps.                                                                                                                          | `true`        | `productionBrowserSourceMaps` |
| `turbopackInputSourceMaps`                                                                                   | Enable extraction of source maps from input files.                                                                                           | `true`        | `true`                        |
| `turbopackTreeShaking`                                                                                       | Use advanced module-fragments tree shaking instead of the default reexports-only mode.                                                       | `false`       | `false`                       |
| `turbopackRemoveUnusedImports`                                                                               | Enable removing unused imports. Requires `turbopackRemoveUnusedExports`.                                                                     | `false`       | `true`                        |
| `turbopackRemoveUnusedExports`                                                                               | Enable removing unused exports.                                                                                                              | `false`       | `true`                        |
| `turbopackInferModuleSideEffects`                                                                            | Enable local analysis to infer side-effect-free modules for better tree shaking.                                                             | `true`        | `true`                        |
| `turbopackScopeHoisting`                                                                                     | Enable scope hoisting. Always disabled in dev mode.                                                                                          | `false`       | `true`                        |
| `turbopackClientSideNestedAsyncChunking`                                                                     | Enable nested async chunking for client-side assets.                                                                                         | `false`       | `true`                        |
| `turbopackServerSideNestedAsyncChunking`                                                                     | Enable nested async chunking for server-side assets.                                                                                         | `false`       | `false`                       |
| `turbopackImportTypeBytes`                                                                                   | Enable support for `with {type: "bytes"}` for ESM imports.                                                                                   | `false`       | `false`                       |
| `turbopackUseBuiltinBabel`                                                                                   | Enable automatic Babel loader configuration when a Babel config file is present.                                                             | `true`        | `true`                        |
| `turbopackUseBuiltinSass`                                                                                    | Enable automatic Sass loader configuration.                                                                                                  | `true`        | `true`                        |
| `turbopackModuleIds`                                                                                         | Module ID strategy: `'named'` or `'deterministic'`.                                                                                          | `'named'`     | `'deterministic'`             |
| [`turbopackLocalPostcssConfig`](/docs/app/api-reference/config/next-config-js/turbopackLocalPostcssConfig)   | Resolve `postcss.config.js` from the CSS file's directory first, then the project root.                                                      | `false`       | `false`                       |
| `turbopackWorkerAssetPrefix`                                                                                 | Custom asset prefix for Web Worker URLs (entrypoint + module chunks), overriding `assetPrefix`. Mirrors webpack's `output.workerPublicPath`. | `undefined`   | `undefined`                   |

```js filename="next.config.js"
module.exports = {
  turbopack: {
    // Example: adding an alias and custom file extension
    resolveAlias: {
      underscore: 'lodash',
    },
    resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.json'],
  },
}
```

For more in-depth configuration examples, see the [Turbopack config documentation](/docs/app/api-reference/config/next-config-js/turbopack).

## Generating trace files for performance debugging

If you encounter performance or memory issues and want to help the Next.js team diagnose them, you can generate a trace file by appending `NEXT_TURBOPACK_TRACING=1` to your dev command:

```bash
NEXT_TURBOPACK_TRACING=1 next dev
```

This will produce a `.next-profiles/trace-turbopack` file. Include that file when creating a GitHub issue on the [Next.js repo](https://github.com/vercel/next.js) to help us investigate.

## Summary

Turbopack is a **Rust-based**, **incremental** bundler designed to make local development and builds fast—especially for large applications. It is integrated into Next.js, offering zero-config CSS, React, and TypeScript support.

## Version Changes

| Version   | Changes                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `v16.0.0` | Turbopack becomes the default bundler for Next.js. Automatic support for Babel when a configuration file is found. |
| `v15.5.0` | Turbopack support for `build` beta                                                                                 |
| `v15.3.0` | Experimental support for `build`                                                                                   |
| `v15.0.0` | Turbopack for `dev` stable                                                                                         |
