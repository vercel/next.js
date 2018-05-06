// based on https://github.com/timneutkens/is-async-supported
const vm = require('vm')

module.exports = function isAsyncSupported () {
  try {
    // eslint-disable-next-line no-new
    new vm.Script('(async () => ({}))()')
    return true
  } catch (e) {
    return false
  }
}
