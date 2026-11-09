import { a } from './a.js'
import { b } from './b.js'

globalThis.evaluationOrder.push('t')

export const t = a + b
