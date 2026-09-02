exports.abc = 'abc'

Object.defineProperties(module, {
  exports: {
    value: {
      abc: 'abc',
      def: 'def',
    },
  },
})
