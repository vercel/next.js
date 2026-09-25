import mod from './dist/index.js'

// `dist` is compiled to CommonJS by swc, which wraps the real plugin object
// in an interop object (`module.exports.default`). Unwrap it so that both
// the default and the named exports resolve to the real plugin values when
// the package is imported from an ES module.
const plugin = mod.default ?? mod

export default plugin
export const rules = plugin.rules
export const configs = plugin.configs
