import base62 from 'next/dist/build/webpack/config/blocks/css/loaders/utils/base62'

describe('base62 tests', () => {
  it('returns first word in dictionary if input equals 0', () => {
    const result = base62(0)

    expect(result).toBe('0')
  })

  it('correctly encodes value', () => {
    const result1 = base62(36)
    expect(result1).toBe('a')

    const result2 = base62(123456)
    expect(result2).toBe('W7E')
  })
})
