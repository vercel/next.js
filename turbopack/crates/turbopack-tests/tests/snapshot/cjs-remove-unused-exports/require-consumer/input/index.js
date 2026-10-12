import { used } from './lib.js'

// A wholesale `require()` consumer reports `ExportUsage::All`, so the graph must
// mark every export used and nothing may be dropped.
const lib = require('./lib.js')

console.log(used, lib.unused)
