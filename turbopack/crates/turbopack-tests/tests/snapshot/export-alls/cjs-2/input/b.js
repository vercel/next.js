// b.js
export * from './c'
// This would not be handled, but still need __turbopack__cjs__
// as there are properties dynamically added by __turbopack__cjs__ in c.js
