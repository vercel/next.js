'use strict'

globalThis.__cjsSideEffectRan = (globalThis.__cjsSideEffectRan || 0) + 1

// The static export makes this module mergeable. The requiring side only does a
// bare `require('./side')`, so this export is never read by name.
exports.runs = globalThis.__cjsSideEffectRan
