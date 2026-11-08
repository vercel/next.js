import { d1 } from './d1.js'
import { d2 } from './d2.js'

globalThis.evaluationOrder.push('r2')

export const r2 = { v: d1.v + d2.v }
