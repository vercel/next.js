// A file of a context that is mapped to `false` is still a key of the context, and
// requiring it gives empty exports, like requiring it directly.
const ctx = require('package')

it('gives an ignored file of a context empty exports', () => {
  expect(ctx.keys()).toEqual(['./ignored.js', './kept.js'])
  expect(ctx('./kept.js')).toBe('kept')
  expect(ctx('./ignored.js')).toEqual({})
})
