import { cycle } from './cycle.js'

globalThis.evaluationOrder.push('left')

export const left = () => cycle
