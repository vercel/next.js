const typecheckedRequire = require('./eslint-typechecked-require')
const noJsxInAppRouter = require('./eslint-no-jsx-in-app-router')

module.exports = {
  rules: {
    'no-jsx-in-app-router': noJsxInAppRouter,
    'typechecked-require': typecheckedRequire,
  },
}
