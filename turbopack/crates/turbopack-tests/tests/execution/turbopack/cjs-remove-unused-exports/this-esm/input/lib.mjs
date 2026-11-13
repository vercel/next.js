// An ES module without exports: top-level `this` is `undefined` here, so it
// must not make the module look like CommonJS.
globalThis.esmThisType = typeof this
