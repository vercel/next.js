import * as R from 'ramda'
import { pipe } from 'ramda'

it('should have the correct `this` context', () => {
  expect((0, R.pipe)()).toBe(false)
  expect(R.pipe()).toBe(true)
  expect(pipe()).toBe(false)
})

it('should import only pipe.js', () => {
  const modules = Array.from(__turbopack_modules__.keys())
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/node_modules\/ramda\/pipe/)
  )
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/ramda\/index/)
  )
})
