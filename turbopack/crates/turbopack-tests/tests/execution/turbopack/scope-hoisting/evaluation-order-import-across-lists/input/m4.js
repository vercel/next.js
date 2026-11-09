import { m3 } from './m3.js'

globalThis.evaluationOrder.push('m4')

export const m4 = { v: m3.v + 'm4' }
