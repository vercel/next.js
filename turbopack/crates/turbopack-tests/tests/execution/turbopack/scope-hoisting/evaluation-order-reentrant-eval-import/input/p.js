import './m.js'
import { a } from './a.js'
import { c } from './c.js'
import { b } from './b.js'

globalThis.evaluationOrder.push('p')

export const p = a + c + b
