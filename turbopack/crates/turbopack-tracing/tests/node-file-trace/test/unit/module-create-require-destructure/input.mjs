import { createRequire } from 'node:module'

// Destructuring pattern - should not crash, but won't be traced
// since we can't bind a single identifier to the createRequire result
const { resolve } = createRequire(new URL('./', import.meta.url))

// This is a normal require that should still be traced
import './dep.js'
