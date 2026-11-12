import { test, expect, should } from 'vitest'
test('Chai should plugin', () => {
  const clean = should()
  ;(42).should.equal(42)
  expect(typeof clean).toBe('object')
})
