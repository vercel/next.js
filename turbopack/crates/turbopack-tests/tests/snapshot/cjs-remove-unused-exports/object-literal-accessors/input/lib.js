// `module.exports = { … }` with accessor/method exports. Unused getters, setters,
// and methods are removed outright — defining one has no side effect.
module.exports = {
  used: 'used-value',
  get usedGetter() {
    return 'used-getter'
  },
  get unusedGetter() {
    return 'unused-getter'
  },
  unusedMethod() {
    return 'unused-method'
  },
}
