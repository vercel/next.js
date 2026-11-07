exports.abc = 'abc'

Object.defineProperty(module, 'exports', {
  value: {
    abc: 'abc',
    def: 'def',
  },
})
