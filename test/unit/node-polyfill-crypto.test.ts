/* eslint-env jest */
import 'next/dist/server/node-polyfill-crypto'

describe('node-polyfill-crypto', () => {
  test('overwrite crypto', () => {
    expect(global.crypto).not.toBeUndefined()
    const a = {} as Crypto
    global.crypto = a
    expect(global.crypto).toBe(a)
  })
})
