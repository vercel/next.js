var Self = Object.defineProperty(exports, 'helper', {
  value: function () {
    return 'abc'
  },
})

exports.abc = function () {
  return Self.helper()
}
