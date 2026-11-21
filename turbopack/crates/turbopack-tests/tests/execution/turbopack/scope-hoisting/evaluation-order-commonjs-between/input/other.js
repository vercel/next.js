import { s1 } from './s1.js'
import { s2 } from './s2.js'

globalThis.evaluationOrder.push('other')

export const other = { v: s1.v + s2.v }
