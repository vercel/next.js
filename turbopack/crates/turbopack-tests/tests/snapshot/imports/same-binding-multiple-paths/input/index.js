// One binding, reached directly and through a re-exporting module under several names. Every
// name reads the same value, so the output declares a single captured binding for all of them.
import { binding } from './module.js'
import { binding as binding3, binding2 } from './reexport.js'
import * as reexports from './reexport.js'

console.log(binding, binding2, binding3, reexports.binding, reexports.binding2)
