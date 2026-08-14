// Exports defined with `Object.defineProperty` getters — the shape TypeScript and
// Next.js emit for CommonJS. The value is only reachable through the getter.
function greet(name) {
  return 'hi ' + name
}

Object.defineProperty(exports, 'greet', {
  enumerable: true,
  get: function () {
    return greet
  },
})
