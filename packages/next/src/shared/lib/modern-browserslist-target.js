// Note: This file is JS because it's used by the taskfile-swc.js file, which is JS.
// Keep file changes in sync with the corresponding `.d.ts` files.
/**
 * These are the browser versions that support all of the following:
 * static import: https://caniuse.com/es6-module
 * dynamic import: https://caniuse.com/es6-module-dynamic-import
 * import.meta: https://caniuse.com/mdn-javascript_operators_import_meta
 */
const MODERN_BROWSERSLIST_TARGET = [
  'chrome 64',
  'edge 79',
  'firefox 67',
  'opera 51',
  'safari 12',
]

module.exports = MODERN_BROWSERSLIST_TARGET
