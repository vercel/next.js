import { barrel } from './barrel.js'

globalThis.evaluationOrder.push('cycle')

export const cycle = 'cycle ' + barrel
