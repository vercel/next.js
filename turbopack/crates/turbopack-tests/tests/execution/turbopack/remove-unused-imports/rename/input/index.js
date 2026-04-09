import { used } from './a.js'

it('should error when importing an invalid export', () => {
  used()

  expect(globalThis.xBundled).toBeTruthy()
})
