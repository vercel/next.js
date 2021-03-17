---
description: Browser support and which JavaScript features are supported by Next.js.
---

# Supported Browsers and Features

Next.js supports **IE11 and all modern browsers** (Edge, Firefox, Chrome, Safari, Opera, et al) with no required configuration.

## Polyfills

We transparently inject polyfills required for IE11 compatibility. In addition, we also inject widely used polyfills, including:

- [**fetch()**](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) — Replacing: `whatwg-fetch` and `unfetch`.
- [**URL**](https://developer.mozilla.org/en-US/docs/Web/API/URL) — Replacing: the [`url` package (Node.js API)](https://nodejs.org/api/url.html).
- [**Object.assign()**](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign) — Replacing: `object-assign`, `object.assign`, and `core-js/object/assign`.

If any of your dependencies includes these polyfills, they’ll be eliminated automatically from the production build to avoid duplication.

In addition, to reduce bundle size, Next.js will only load these polyfills for browsers that require them. The majority of the web traffic globally will not download these polyfills.

### Server-Side Polyfills

In addition to `fetch()` on the client side, Next.js polyfills `fetch()` in the Node.js environment. You can use `fetch()` on your server code (such as `getStaticProps`) without using polyfills such as `isomorphic-unfetch` or `node-fetch`.

### Custom Polyfills

If your own code or any external npm dependencies require features not supported by your target browsers, you need to add polyfills yourself.

In this case, you should add a top-level import for the **specific polyfill** you need in your [Custom `<App>`](/docs/advanced-features/custom-app.md) or the individual component.

## JavaScript Language Features

Next.js allows you to use the latest JavaScript features out of the box. In addition to [ES6 features](https://github.com/lukehoban/es6features), Next.js also supports:

- [Async/await](https://github.com/tc39/ecmascript-asyncawait) (ES2017)
- [Object Rest/Spread Properties](https://github.com/tc39/proposal-object-rest-spread) (ES2018)
- [Dynamic `import()`](https://github.com/tc39/proposal-dynamic-import) (ES2020)
- [Optional Chaining](https://github.com/tc39/proposal-optional-chaining) (ES2020)
- [Nullish Coalescing](https://github.com/tc39/proposal-nullish-coalescing) (ES2020)
- [Class Fields](https://github.com/tc39/proposal-class-fields) and [Static Properties](https://github.com/tc39/proposal-static-class-features) (part of stage 3 proposal)
- and more!

### TypeScript Features

Next.js has built-in TypeScript support. [Learn more here](/docs/basic-features/typescript.md).

### Customizing Babel Config (Advanced)

You can customize babel configuration. [Learn more here](/docs/advanced-features/customizing-babel-config.md).
