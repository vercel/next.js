import { m2 } from './m2.js'

globalThis.evaluationOrder.push('m7')

export const m7 = { v: m2.v + 'm7' }
