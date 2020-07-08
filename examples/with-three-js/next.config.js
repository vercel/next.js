const withTM = require('next-transpile-modules')([
  'drei',
  'three',
  'postprocessing',
])

module.exports = withTM()
