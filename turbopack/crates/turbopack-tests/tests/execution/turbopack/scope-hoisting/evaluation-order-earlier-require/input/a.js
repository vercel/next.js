globalThis.evaluationOrder.push('a')

export function load() {
  return require('./r.js')
}
