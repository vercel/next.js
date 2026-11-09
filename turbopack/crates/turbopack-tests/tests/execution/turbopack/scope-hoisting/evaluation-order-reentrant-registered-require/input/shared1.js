import { call } from './registry.js'

globalThis.evaluationOrder.push('shared1')

call('above')

export const shared1 = 'shared1'
