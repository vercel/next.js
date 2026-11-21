import './base.js'
import { outer } from './outer.js'

globalThis.evaluationOrder.push('a')

export const a = { v: outer }
