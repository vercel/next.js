const typecheckedRequire = require('./eslint-typechecked-require')
const noAmbiguousJSX = require('./eslint-no-ambiguous-jsx')
const errorSubclassStaticName = require('./eslint-error-subclass-static-name')

module.exports = {
  rules: {
    'no-ambiguous-jsx': noAmbiguousJSX,
    'typechecked-require': typecheckedRequire,
    'error-subclass-static-name': errorSubclassStaticName,
  },
}
