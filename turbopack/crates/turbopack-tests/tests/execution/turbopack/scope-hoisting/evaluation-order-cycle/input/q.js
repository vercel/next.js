import { e } from './e.js'

globalThis.evaluationOrder.push('q')

export const q = { v: e.v + e.f() + 'q' }
