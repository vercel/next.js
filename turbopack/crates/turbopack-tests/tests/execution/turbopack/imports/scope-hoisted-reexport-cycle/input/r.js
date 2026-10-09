// A side effect keeps this module a real re-exporter instead of being optimized away.
globalThis.scopeHoistedReexportCycleRan = true

export { readB } from './a.js'
export { b } from './x.js'
