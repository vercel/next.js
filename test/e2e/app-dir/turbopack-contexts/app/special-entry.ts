// Imported through the `my-ctx` derived context (inherits `next-app-route`), which adds the
// `special-loader.cjs` rule for `*.special.js` and the `my-cond` resolve condition.
import contextValue from '../value.special.js' with { 'turbopack-transition': 'my-ctx' }
// @ts-expect-error -- cond-pkg has no types
import contextCond from 'cond-pkg' with { 'turbopack-transition': 'my-ctx' }

export { contextValue, contextCond }
