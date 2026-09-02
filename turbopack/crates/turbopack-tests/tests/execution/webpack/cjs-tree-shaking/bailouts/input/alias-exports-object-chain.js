var Self

Self = module.exports = {
  helper: function () {
    return 'abc'
  },
  abc: function () {
    return Self.helper()
  },
}
