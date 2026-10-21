import { __name } from './name.js'

// The PURE annotation applies to the inner `__name(...)` call only. The outer
// call (the IIFE) has side effects and must be kept.
;(/* @__PURE__ */ __name(function annotated() {
  console.log('annotated IIFE ran')
}, 'annotated'))()

export const value = 1
