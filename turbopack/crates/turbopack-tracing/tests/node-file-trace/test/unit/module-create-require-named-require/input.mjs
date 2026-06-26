import * as module from 'node:module'

// Variable named 'require' - might conflict
const require = module.createRequire(new URL('./sub/', import.meta.url))
const lib = require('./lib.node')
