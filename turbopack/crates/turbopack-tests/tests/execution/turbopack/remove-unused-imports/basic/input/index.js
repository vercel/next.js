import { used } from './a.js'

it('should error when importing an invalid export', () => {
  expect(used()).toBe(1234)

  expect(globalThis.xBundled).toBeUndefined()
  expect(globalThis.yBundled).toBeTruthy()
})
