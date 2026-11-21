import './m3.js'
import './m4.js'

globalThis.evaluationOrder.push('m2')

export function later() {
  return require('./m4.js')
}
