import { r } from './r.js'

globalThis.evaluationOrder.push('m')

export const m = { v: r.v + 'm' }
