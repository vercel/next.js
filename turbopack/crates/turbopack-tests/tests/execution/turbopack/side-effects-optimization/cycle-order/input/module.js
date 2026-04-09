export { something } from './inner.js'
export const value = 42
;(globalThis.order ??= []).push('module')
