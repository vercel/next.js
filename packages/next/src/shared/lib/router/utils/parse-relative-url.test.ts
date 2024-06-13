import { parseRelativeUrl } from './parse-relative-url'

describe('relative urls', () => {
  it('should return valid pathname', () => {
    expect(parseRelativeUrl('/').pathname).toBe('/')
    expect(parseRelativeUrl('/abc').pathname).toBe('/abc')
  })

  it('should throw for invalid pathname', () => {
    expect(() => parseRelativeUrl('//**y/\\')).toThrow()
    expect(() => parseRelativeUrl('//google.com')).toThrow()
  })
})

describe('query parsing', () => {
  it('should parse query string', () => {
    expect(parseRelativeUrl('/?a=1&b=2').query).toEqual({ a: '1', b: '2' })
    expect(parseRelativeUrl('/').query).toEqual({})
  })
})
