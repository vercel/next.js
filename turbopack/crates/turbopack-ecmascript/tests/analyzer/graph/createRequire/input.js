import * as moduleEsm from 'node:module'
const moduleRequire = require('module')

const req_ok1 = moduleEsm.createRequire(import.meta.url)
req_ok1('./file1')

const req_ok2 = moduleRequire.createRequire(import.meta.url)
req_ok2('./file2')

const req_ok3 = moduleRequire.createRequire(__filename)
req_ok3('./file3')

const req_fail1 = moduleRequire.createRequire(globalThis.foo)
req_fail1('./file4')
