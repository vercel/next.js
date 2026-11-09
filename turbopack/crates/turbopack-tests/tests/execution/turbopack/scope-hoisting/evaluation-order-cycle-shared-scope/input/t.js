import { readX } from './a.js'
import { x } from './x.js'

globalThis.evaluationOrder.push('t')

export const t = `${readX()} ${x}`
