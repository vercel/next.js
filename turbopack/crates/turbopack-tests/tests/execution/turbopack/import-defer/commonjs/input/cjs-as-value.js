const { log } = require('./log.js')

log.push('cjs-as-value')

const key = ['dynamic', 'Key'].join('')
module.exports[key] = 'dynamic'
