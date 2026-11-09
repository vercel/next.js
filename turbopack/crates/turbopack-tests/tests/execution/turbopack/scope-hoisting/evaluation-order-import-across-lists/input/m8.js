import { m7 } from './m7.js'

globalThis.evaluationOrder.push('m8')

export const m8 = { v: m7.v + 'm8' }
