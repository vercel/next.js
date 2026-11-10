var module2 = require('./module')
module.exports = {
  module1: require('./module'),
  module2,
}
module.exports.module3 = require('./module')
var m4 = require('./module')
module.exports.module4 = m4
