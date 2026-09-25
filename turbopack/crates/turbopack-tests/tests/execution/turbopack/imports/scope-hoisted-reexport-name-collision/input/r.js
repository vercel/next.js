// A side effect keeps this module a real re-exporter instead of being optimized away.
globalThis.scopeHoistedReexportNameCollisionRan = true

export { b as a } from './x.js'
