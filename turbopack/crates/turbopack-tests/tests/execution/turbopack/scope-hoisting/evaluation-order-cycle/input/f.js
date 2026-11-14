import { e } from './e.js'

globalThis.evaluationOrder.push('f')

export const f = { v: 'f', e: () => e.v }
