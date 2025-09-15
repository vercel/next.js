const { register } = require('module')
const { pathToFileURL } = require('url')

import('./input-esm.mjs')

// Load relative to the current file
register('./hook2.mjs', pathToFileURL(__filename))
// Load relative to the current working directory
register('./test/unit/module-register/hook3.mjs', pathToFileURL('./'))
