import { d1 } from './d1.js'
import { d2 } from './d2.js'
import { e1 } from './e1.js'
import { e2 } from './e2.js'

globalThis.evaluationOrder.push('r1')

export const r1 = { v: d1.v + d2.v + e1.v + e2.v }
