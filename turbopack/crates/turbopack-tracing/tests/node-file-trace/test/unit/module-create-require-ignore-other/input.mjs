import * as module from 'node:module'

// This require variable is NOT from module.createRequire, so it should be ignored
// and not tracked for dependency analysis
const require = () => {}
const lib = require('./lib.node') // This should NOT be detected as a dependency
