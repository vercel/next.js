const stylus = require('stylus')

module.exports = function () {
  return function (style) {
    style.define(
      'buildDependencyValue',
      new stylus.nodes.String('stylus-value')
    )
  }
}
