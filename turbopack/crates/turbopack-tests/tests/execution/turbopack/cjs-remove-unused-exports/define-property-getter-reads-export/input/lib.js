// `b`'s getter reads `exports.a`, so `a` is reachable through `b`. That read must
// taint the module (nothing dropped), even though only `b` is imported.
Object.defineProperty(exports, '__esModule', { value: true })
Object.defineProperty(exports, 'a', {
  enumerable: true,
  get: function () {
    return 'a-value'
  },
})
Object.defineProperty(exports, 'b', {
  enumerable: true,
  get: function () {
    return exports.a
  },
})
