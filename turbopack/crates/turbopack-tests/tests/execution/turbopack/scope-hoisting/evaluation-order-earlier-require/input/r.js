import { d } from './d.js'
import { d2 } from './d2.js'

globalThis.evaluationOrder.push('r')

export const r = { v: d.v + d2.v }
