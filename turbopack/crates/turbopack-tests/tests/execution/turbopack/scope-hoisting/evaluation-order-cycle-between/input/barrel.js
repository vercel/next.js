export { base } from './base.js'
export * as left from './left.js'
export * as right from './right.js'

globalThis.evaluationOrder.push('barrel')

export const barrel = 'barrel'
