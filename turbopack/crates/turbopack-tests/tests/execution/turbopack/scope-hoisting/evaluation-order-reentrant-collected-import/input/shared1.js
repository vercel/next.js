import { call } from './registry.js'

globalThis.evaluationOrder.push('shared1')

call('entry')

export const shared1 = 'shared1'
