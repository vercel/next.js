import { createRequire } from 'node:module'

// Named import instead of namespace import
const req = createRequire(new URL('./sub/', import.meta.url))
const lib = req('./lib.node')
