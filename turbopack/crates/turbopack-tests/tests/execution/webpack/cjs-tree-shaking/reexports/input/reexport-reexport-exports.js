exports.reexport1 = require('./reexport-whole-exports').module1
var m2 = require('./reexport-whole-exports')
exports.reexport2 = m2.module2
this.reexport3 = require('./reexport-whole-exports').module3
var m4 = require('./reexport-whole-exports')
this.reexport4 = m4.module4
