const typecheckedRequire = require('./eslint-typechecked-require')
const noAmbiguousJSX = require('./eslint-no-ambiguous-jsx')

module.exports = {
  rules: {
    'no-ambiguous-jsx': noAmbiguousJSX,
    'typechecked-require': typecheckedRequire,
  },
}
