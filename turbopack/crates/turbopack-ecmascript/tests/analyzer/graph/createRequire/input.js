import * as moduleEsm from 'node:module'
const moduleRequire = require('module')

const req_ok1 = moduleEsm.createRequire(import.meta.url)
req1('./some-file')

const req_ok2 = moduleRequire.createRequire(import.meta.url)
req2('./some-other-file')

const req_ok3 = moduleRequire.createRequire(__filename)
req2('./some-other-file')

const req_fail1 = moduleRequire.createRequire(globalThis.foo)
req2('./some-other-file')
