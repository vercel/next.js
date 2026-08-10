// This module declares itself as side-effect-free via package.json
// The global lets us test if it was bundled
globalThis.sideEffectFreeBundled = true

export function noop() {
  // This function does nothing
}
