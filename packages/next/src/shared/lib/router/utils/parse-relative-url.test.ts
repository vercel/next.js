import { parseRelativeUrl } from './parse-relative-url'

describe('relative urls', () => {
  it('should return valid pathname', () => {
    expect(parseRelativeUrl('/').pathname).toBe('/')
    expect(parseRelativeUrl('/abc').pathname).toBe('/abc')
    expect(parseRelativeUrl('//**y/\\').pathname).toBe('//**y//')
    expect(parseRelativeUrl('//google.com').pathname).toBe('//google.com')
  })

  it('should parse dot-relative urls against the server base', () => {
    expect(parseRelativeUrl('./abc').pathname).toBe('/abc')
    expect(parseRelativeUrl('../abc').pathname).toBe('/abc')

    // Resolving a URL must not mutate the shared server base between calls.
    expect(parseRelativeUrl('/one').pathname).toBe('/one')
    expect(parseRelativeUrl('/two').pathname).toBe('/two')
  })

  it('should throw for invalid pathname', () => {
    expect(() => parseRelativeUrl('http://example.com/abc')).toThrow()
  })
})

describe('query parsing', () => {
  it('should parse query string', () => {
    expect(parseRelativeUrl('/?a=1&b=2').query).toEqual({ a: '1', b: '2' })
    expect(parseRelativeUrl('/').query).toEqual({})
  })
})
