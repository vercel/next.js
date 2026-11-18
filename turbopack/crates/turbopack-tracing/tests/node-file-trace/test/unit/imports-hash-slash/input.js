import { greet } from '#/lib/greet.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { name } = require('#/lib/name.cjs')

console.log(greet(name))
