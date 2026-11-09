import './reader.js'
import { x } from './x.js'

globalThis.evaluationOrder.push('a')

export function readX() {
  return x
}
