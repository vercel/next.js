'use strict'

// The shape every TypeScript-compiled CommonJS module has. The `__esModule`
// marker writes to `exports`, which a merged module has no binding for, so the
// merge has to drop the call rather than emit it.
Object.defineProperty(exports, '__esModule', { value: true })

function greet(name) {
  return 'hi ' + name
}

exports.greet = greet
