import { f } from './f.js'

globalThis.evaluationOrder.push('e')

export const e = { v: 'e', f: () => f.v }
