exports.property1 = require('./module').abc
var m2 = require('./module')
exports.property2 = m2.abc
this.property3 = require('./module').abc
var m4 = require('./module')
this.property4 = m4.abc
