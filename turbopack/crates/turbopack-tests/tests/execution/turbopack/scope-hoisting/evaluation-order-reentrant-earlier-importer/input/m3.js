module.exports.later = function later() {
  return require('./m4.js')
}

globalThis.evaluationOrder.push('m3')

require('./m1.js')
