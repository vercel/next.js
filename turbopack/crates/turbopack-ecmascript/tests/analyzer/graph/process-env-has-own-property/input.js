// `hasOwnProperty` could also be an env var, shadowing the method
const method = process.env.hasOwnProperty
const type = typeof process.env.hasOwnProperty
const cond = process.env.hasOwnProperty ? 'truthy' : 'falsy'
const has = process.env.hasOwnProperty('FOO')
// `Object.hasOwn` might not be supported by the runtime
const hasOwnCond = Object.hasOwn ? 'native' : 'fallback'
const hasOwnFallback = Object.hasOwn || function hasOwn() {}
