import { parseRelativeUrl } from './parse-relative-url'

describe('relative urls', () => {
  it('should return valid pathname', () => {
    expect(parseRelativeUrl('/').pathname).toBe('/')
    expect(parseRelativeUrl('/abc').pathname).toBe('/abc')
    expect(parseRelativeUrl('//**y/\\').pathname).toBe('//**y//')
    expect(parseRelativeUrl('//google.com').pathname).toBe('//google.com')
  })

  it('should preserve all fields for normalized path-only URLs', () => {
    expect(parseRelativeUrl('/docs/v1.0/getting-started/~user')).toEqual({
      auth: null,
      host: null,
      hostname: null,
      pathname: '/docs/v1.0/getting-started/~user',
      port: null,
      protocol: null,
      query: {},
      search: '',
      hash: '',
      href: '/docs/v1.0/getting-started/~user',
      slashes: null,
    })
  })

  it('should preserve the parseQuery false return shape', () => {
    expect(parseRelativeUrl('/docs/api', undefined, false)).toStrictEqual({
      auth: null,
      host: null,
      hostname: null,
      pathname: '/docs/api',
      port: null,
      protocol: null,
      query: undefined,
      search: '',
      hash: '',
      href: '/docs/api',
      slashes: null,
    })
  })

  it.each([
    ['/docs\n', '/docs'],
    ['/docs\r', '/docs'],
    ['/docs\u2028', '/docs%E2%80%A8'],
    ['/docs\u2029', '/docs%E2%80%A9'],
  ])(
    'should continue to normalize a trailing line terminator in %p',
    (url, expected) => {
      const parsed = parseRelativeUrl(url)
      expect(parsed.pathname).toBe(expected)
      expect(parsed.href).toBe(expected)
    }
  )

  it('should continue to normalize dot segments', () => {
    expect(parseRelativeUrl('/docs/../api').pathname).toBe('/api')
  })

  it('should continue to validate an explicit base', () => {
    expect(() => parseRelativeUrl('/abc', 'http://example.com')).toThrow()
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
