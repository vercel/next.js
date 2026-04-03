import * as module from 'node:module'

// Destructuring pattern - should not crash, but won't be traced
// since we can't bind a single identifier to the createRequire result
const { resolve } = module.createRequire(import.meta.url)

// This is a normal require that should still be traced
require('./dep.js')
