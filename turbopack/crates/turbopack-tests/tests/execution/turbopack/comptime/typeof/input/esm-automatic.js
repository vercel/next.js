import './dep.js'

globalThis.typeofs ??= {}
globalThis.typeofs['esm-automatic'] = {
  require: typeof require,
  importMeta: typeof import.meta,
  // ESM, should be `undefined`
  module: typeof module,
  exports: typeof exports,
  // ESM, should be require stub
  requireValue: require,
}
