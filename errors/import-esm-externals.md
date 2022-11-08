# ESM packages need to be imported

#### Why This Error Occurred

Packages in node_modules that are published as EcmaScript Module, need to be `import`ed via `import ... from 'package'` or `import('package')`.

You get this error when using a different way to reference the package, e. g. `require()`.

#### Possible Ways to Fix It

1. Use `import` or `import()` to reference the package instead. (Recommended)

2. If you are already using `import`, make sure that this is not changed by a transpiler, e. g. TypeScript or Babel.

3. Switch to loose mode (`experimental.esmExternals: 'loose'`), which tries to automatically correct this error.

### Useful Links

- [Node.js ESM require docs](https://nodejs.org/dist/latest-v16.x/docs/api/esm.html#esm_require)
