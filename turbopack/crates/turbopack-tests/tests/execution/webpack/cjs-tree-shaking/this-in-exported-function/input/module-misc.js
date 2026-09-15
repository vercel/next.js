exports.helper = function () {
  return 'h'
}

exports.viaGenerator = function* () {
  yield this.helper()
}

exports.viaAsync = async function () {
  return this.helper()
}

exports.viaDefaultParam = function (x = this.helper()) {
  return x
}

exports.viaComputed = function () {
  return this['helper']()
}

// exports.usedExports = __webpack_exports_info__.usedExports;
