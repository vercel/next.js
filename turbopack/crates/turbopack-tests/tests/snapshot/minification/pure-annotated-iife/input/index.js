var __defProp = Object.defineProperty
var __name = (target, value) =>
  __defProp(target, 'name', { value, configurable: true })

// The PURE annotation applies to the inner `__name(...)` call only. The outer
// call (the IIFE) has side effects and must be kept.
;(/* @__PURE__ */ __name(function annotated() {
  console.log('annotated IIFE ran')
}, 'annotated'))()
