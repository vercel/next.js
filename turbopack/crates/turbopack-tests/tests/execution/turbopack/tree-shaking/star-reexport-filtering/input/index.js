import value, { shadowed, shadowedUsed, defaultUsed } from './barrel'

it('does not forward locally shadowed or default names through export star', () => {
  expect(value).toBe('local-default')
  expect(shadowed).toBe('local')
  expect(shadowedUsed).toBe(false)
  expect(defaultUsed).toBe(false)
})
