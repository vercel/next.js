const { used } = require('./lib.js')

it('reads a destructured CommonJS export (siblings narrowed away)', () => {
  expect(used).toBe('used-value')
})

it('reads a member-accessed CommonJS export (siblings narrowed away)', () => {
  expect(require('./lib2.js').used).toBe('used2-value')
})
