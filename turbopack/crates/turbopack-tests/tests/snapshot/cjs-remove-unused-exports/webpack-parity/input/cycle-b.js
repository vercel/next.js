const a = require('./cycle-a.js')
exports.sawBefore = a.before
exports.sawAfter = a.after
exports.value = 'USED_CYCLE_B_VALUE'
