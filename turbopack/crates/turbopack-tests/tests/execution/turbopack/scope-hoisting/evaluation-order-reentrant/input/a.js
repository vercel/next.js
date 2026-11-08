import { x } from './x.js'
import './commonjs.js'
import { y } from './y.js'

globalThis.evaluationOrder.push('a')

export const a = { v: x.v + y.v }
