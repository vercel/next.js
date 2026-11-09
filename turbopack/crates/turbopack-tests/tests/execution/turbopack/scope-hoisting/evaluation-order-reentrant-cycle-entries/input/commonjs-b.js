require('./n.js')

globalThis.evaluationOrder.push('commonjs-b')

module.exports.other = function other() {
  return require('./commonjs-a.js')
}
