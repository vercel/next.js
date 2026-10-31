const typecheckedRequire = require('./eslint-typechecked-require')
const noAmbiguousJSX = require('./eslint-no-ambiguous-jsx')
const noAsAny = require('./eslint-no-as-any')
const requireDisableReason = require('./eslint-require-disable-reason')

module.exports = {
  rules: {
    'no-ambiguous-jsx': noAmbiguousJSX,
    'no-as-any': noAsAny,
    'require-disable-reason': requireDisableReason,
    'typechecked-require': typecheckedRequire,
  },
}
