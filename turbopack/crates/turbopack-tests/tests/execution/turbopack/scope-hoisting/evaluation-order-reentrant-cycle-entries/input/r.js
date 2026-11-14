import { q } from './q.js'

globalThis.evaluationOrder.push('r')
globalThis.seenByR = q.v
