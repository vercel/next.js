import { m, mUsed, nUsed } from './barrel'

it('should keep narrowing exports through an `export *` barrel', () => {
  expect(m).toBe(1)
  if (process.env.NODE_ENV === 'production') {
    expect(mUsed).toBe(true)
    expect(nUsed).toBe(false)
  }
})
