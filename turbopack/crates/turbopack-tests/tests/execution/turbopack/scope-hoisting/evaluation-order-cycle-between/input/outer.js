import * as cycle from './cycle.js'

globalThis.evaluationOrder.push('outer')

export const outer = () => cycle.cycle
