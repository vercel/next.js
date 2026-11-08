import { d } from './d.js'

globalThis.evaluationOrder.push('r')

export const r = { v: d.v + 'r' }
