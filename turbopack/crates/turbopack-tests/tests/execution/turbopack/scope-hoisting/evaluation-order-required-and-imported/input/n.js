import { d } from './d.js'

globalThis.evaluationOrder.push('n')

export const n = { v: d.v + 'n' }
