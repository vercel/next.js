import './n.js'
import { a } from './a.js'
import { b } from './b.js'

globalThis.evaluationOrder.push('m')

export const m = a + b
