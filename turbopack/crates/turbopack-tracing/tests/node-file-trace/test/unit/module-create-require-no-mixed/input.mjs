import * as module from 'node:module'

const req = module.createRequire(new URL('./sub/', import.meta.url))
const lib = req('./lib.node')
