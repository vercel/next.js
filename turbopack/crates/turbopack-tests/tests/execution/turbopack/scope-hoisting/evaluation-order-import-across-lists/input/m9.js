import { m0 } from './m0.js'
import { m4 } from './m4.js'

globalThis.evaluationOrder.push('m9')

export const m9 = { v: m0.v + m4.v + 'm9' }
