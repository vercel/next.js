import { shared1 } from './shared1.js'
import { shared2 } from './shared2.js'

globalThis.evaluationOrder.push('b')

export const b = () => `${shared1} ${shared2}`
