var m2 = require('./reexport-whole-module-exports')
module.exports = {
  reexport1: require('./reexport-whole-module-exports').module1,
  reexport2: m2.module2,
}
module.exports.reexport3 = require('./reexport-whole-module-exports').module3
var m4 = require('./reexport-whole-module-exports')
module.exports.reexport4 = m4.module4
