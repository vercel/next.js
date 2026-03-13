// This module declares itself as side-effect-free via package.json
// The global lets us test if it was bundled
globalThis.sideEffectFreeBundled = true

export const unused = 'not imported'
