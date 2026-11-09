import { call } from './registry.js'

globalThis.evaluationOrder.push('shared1')

call('beside')

export const shared1 = 'shared1'
