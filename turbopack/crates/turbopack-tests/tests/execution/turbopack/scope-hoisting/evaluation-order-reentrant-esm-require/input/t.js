import { m1 } from './m1.js'
import { m2 } from './m2.js'

globalThis.evaluationOrder.push('t')

export const t = m1 + m2
