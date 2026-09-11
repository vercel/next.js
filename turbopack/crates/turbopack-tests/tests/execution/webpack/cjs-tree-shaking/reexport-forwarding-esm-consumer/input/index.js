import { used, usedInfo, unusedInfo } from './forwarder'

it('supports an ESM named import through a CommonJS whole-module reexport', () => {
  expect(used).toBe('used')
  expect(usedInfo).toBe(true)
  expect(unusedInfo).toBe(false)
})
