require('./m.js')

globalThis.evaluationOrder.push('commonjs-a')

module.exports.other = function other() {
  return require('./commonjs-b.js')
}
