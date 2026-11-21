import { cycle } from './cycle.js'

globalThis.evaluationOrder.push('right')

export const right = () => cycle
