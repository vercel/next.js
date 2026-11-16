globalThis.typeofs ??= {}
globalThis.typeofs['cjs'] = {
  require: typeof require,
  importMeta: typeof import.meta,
  // CJS, should be `object`
  module: typeof module,
  exports: typeof exports,
  // CJS, should be real require
  requireValue: require,
}
