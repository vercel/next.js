module.exports =
  global.process?.env && typeof global.process?.env === 'object'
    ? global.process
    : require('../../compiled/process')
