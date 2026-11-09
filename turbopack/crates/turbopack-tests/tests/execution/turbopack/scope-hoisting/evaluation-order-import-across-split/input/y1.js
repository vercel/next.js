import { x } from './x.js'

globalThis.evaluationOrder.push('y1')

export const y1 = { v: x.v + 'y1' }
