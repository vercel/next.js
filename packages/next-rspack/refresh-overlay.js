if (!$ReactRefreshRuntime$.refresh) {
  $ReactRefreshRuntime$.refresh = function () {}
}

module.exports = {
  handleRuntimeError(error) {
    throw error
  },
  clearRuntimeErrors() {},
}
