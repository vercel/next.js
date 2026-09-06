var m2 = require('./module')
module.exports = {
  property1: require('./module').abc,
  property2: m2.abc,
}
module.exports.property3 = require('./module').abc
var m4 = require('./module')
module.exports.property4 = m4.abc
