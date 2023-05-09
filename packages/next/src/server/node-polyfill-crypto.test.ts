/* eslint-env jest */
import './node-polyfill-crypto'

describe('node-polyfill-crypto', () => {
  test('overwrite crypto', async () => {
    expect(global.crypto).not.toBeUndefined()
    const a = {} as Crypto
    global.crypto = a
    expect(global.crypto).toBe(a)
  })
})
