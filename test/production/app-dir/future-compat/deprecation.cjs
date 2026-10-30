process.emitWarning('Future compatibility test deprecation', {
  type: 'DeprecationWarning',
  code: 'DEP_FUTURE_COMPAT_TEST',
})

process.nextTick(() => console.log('deprecation test finished'))
