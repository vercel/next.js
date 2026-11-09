import { register } from './registry.js'

globalThis.evaluationOrder.push('holder')

register('beside', () => require('./beside.js'))
