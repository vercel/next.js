exports.before = 'USED_CYCLE_A_BEFORE'
const b = require('./cycle-b.js')
exports.fromB = b.value
exports.after = 'USED_CYCLE_A_AFTER'
