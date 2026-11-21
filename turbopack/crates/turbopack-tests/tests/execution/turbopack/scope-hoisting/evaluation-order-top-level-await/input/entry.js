import { a } from './a.js'
import { b } from './b.js'
import { c } from './c.js'

globalThis.evaluationOrder.push('entry')

export const entry = { v: a.v + b.v + c.v }
