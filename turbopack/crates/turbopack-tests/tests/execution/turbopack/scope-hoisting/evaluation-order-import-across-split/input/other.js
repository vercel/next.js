import { y1 } from './y1.js'
import { y2 } from './y2.js'

globalThis.evaluationOrder.push('other')

export const other = { v: y1.v + y2.v }
