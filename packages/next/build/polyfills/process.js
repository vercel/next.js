module.exports =
  typeof global.process?.env === 'object'
    ? global.process
    : require('../../compiled/process')
