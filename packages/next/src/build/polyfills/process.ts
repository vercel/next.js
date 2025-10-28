module.exports =
  global.process?.env && typeof global.process?.env === 'object'
    ? global.process
    : (require('next/dist/compiled/process') as typeof import('next/dist/compiled/process'))
