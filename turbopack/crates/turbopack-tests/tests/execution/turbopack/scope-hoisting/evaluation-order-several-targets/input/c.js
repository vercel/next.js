import { e1 } from './e1.js'

globalThis.evaluationOrder.push('c')

export const c = { v: e1.v }
