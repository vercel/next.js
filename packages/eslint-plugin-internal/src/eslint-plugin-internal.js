const typecheckedRequire = require('./eslint-typechecked-require')
const noAmbiguousJSX = require('./eslint-no-ambiguous-jsx')
const noAdhocSleep = require('./eslint-no-adhoc-sleep')

module.exports = {
  rules: {
    'no-adhoc-sleep': noAdhocSleep,
    'no-ambiguous-jsx': noAmbiguousJSX,
    'typechecked-require': typecheckedRequire,
  },
}
