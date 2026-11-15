const idx = process.execArgv.indexOf('--cpu-prof')
if (idx >= 0) process.execArgv.splice(idx, 1)

module.exports = {}
