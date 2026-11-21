import { d } from './d.js'
import { e } from './e.js'

globalThis.evaluationOrder.push('r')

export const r = { v: d.v + e.v + e.f() }
