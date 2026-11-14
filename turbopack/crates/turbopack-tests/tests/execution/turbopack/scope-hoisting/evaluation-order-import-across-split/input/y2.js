import { x } from './x.js'

globalThis.evaluationOrder.push('y2')

export const y2 = { v: x.v + 'y2' }
