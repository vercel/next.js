import { stableJson } from './typeCheckResult'

describe('stableJson', () => {
  it('sorts object keys by code point instead of the host locale', () => {
    expect(
      stableJson({
        z: 1,
        ä: 2,
        a: {
          z: 3,
          ä: 4,
          a: 5,
        },
      })
    ).toBe('{"a":{"a":5,"z":3,"ä":4},"z":1,"ä":2}')
  })
})
