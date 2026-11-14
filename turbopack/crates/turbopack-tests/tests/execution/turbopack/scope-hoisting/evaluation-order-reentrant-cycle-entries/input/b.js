import { p } from './p.js'
import './commonjs-b.js'
import { q } from './q.js'

globalThis.evaluationOrder.push('b')

export const b = { v: p.v + q.v }
