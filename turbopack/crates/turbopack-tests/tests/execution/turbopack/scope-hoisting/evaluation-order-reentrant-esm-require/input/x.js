import './w.js'
import { m1 } from './m1.js'
import { m2 } from './m2.js'

globalThis.evaluationOrder.push('x')
globalThis.seenByX = m1 + m2
