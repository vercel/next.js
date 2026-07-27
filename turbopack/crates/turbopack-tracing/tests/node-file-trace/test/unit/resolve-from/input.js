var resolveFrom = require('resolve-from')
var x = resolveFrom(__dirname, './dep.js')
require(x)
