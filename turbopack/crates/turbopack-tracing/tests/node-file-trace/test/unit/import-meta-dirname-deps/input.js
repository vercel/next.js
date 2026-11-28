import { createRequire } from 'module'
import { join } from 'path'

await import(join(import.meta.dirname, 'dep.mjs'))
const require = createRequire(import.meta.url)
require(join(import.meta.dirname, 'dep.js'))
