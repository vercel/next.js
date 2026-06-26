// ESM entry, selected by Node via the `import` condition. It re-exports a named
// binding from a relative `./private/*.js` submodule, which (because this package
// is not `type: module`) is CommonJS.
export { useMessageFormatter } from './private/useMessageFormatter.js'
