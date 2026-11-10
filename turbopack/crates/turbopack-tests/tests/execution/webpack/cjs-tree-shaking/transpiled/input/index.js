it('should support typescript export *', () => {
  expect(require('./typescript-reexport').abc).toBe('abc')
})

it('should support babel default interop', () => {
  var xxx2 = _interopRequireDefault(require('./module'))
  var xxx3 = _interopRequireDefault(require('./module'))
  expect(xxx2.default.abc).toBe('abc')
  expect(xxx3.default).toEqual({ abc: 'abc', def: 'def' })
})

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj }
}
