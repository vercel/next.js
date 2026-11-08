import * as right from './right.js'

globalThis.evaluationOrder.push('b')

export const b = { v: right.right }
