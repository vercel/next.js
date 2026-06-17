import * as module from 'node:module'

const req = module.createRequire(import.meta.url)
const lib = req('./lib.node')
