import "./shims";

// Necessary for Next.js to accept and handle the `webpackHMR` option properly
// in next-hydrate.js.
process.env.NODE_ENV = "development";

// This is a fix for web-vitals.js not being linked properly.
globalThis.__dirname = "";

// Next uses __webpack_require__ extensively.
globalThis.__webpack_require__ = (name) => {
  console.error(
    `__webpack_require__ is not implemented (when requiring ${name})`
  );
};

// initialize() needs `__webpack_public_path__` to be defined.
globalThis.__webpack_public_path__ = undefined;

// Avoids Next loading _next/static/[buildId]/_devMiddlewareManifest.json
globalThis.__DEV_MIDDLEWARE_MATCHERS = [];
