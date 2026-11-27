import {
  cloneRelativeURL,
  formatRelativeURL,
  parseRequestPath,
  toAbsoluteURL,
  tryParseRequestURL,
} from 'next/dist/shared/lib/router/utils/relative-url'

describe('relative request URLs', () => {
  it.each([
    '/',
    '//example.com/a?x=1',
    '///a',
    '/a?x=1&x=2&empty=&encoded=%2F&space=%20&plus=+',
    '/a?',
    '/a#',
    '/a?#',
  ])('round trips %s without introducing an authority', (input) => {
    const url = parseRequestPath(input)
    expect(formatRelativeURL(url)).toBe(input)
    expect(formatRelativeURL(cloneRelativeURL(url))).toBe(input)
    const absolute = toAbsoluteURL(url, new URL('https://example.org/base'))
    expect(absolute.origin).toBe('https://example.org')
    expect(absolute.href).toBe('https://example.org' + input)
  })

  it('keeps search and searchParams synchronized without sharing clones', () => {
    const original = parseRequestPath('/a?x=1&x=2')
    const clone = cloneRelativeURL(original)
    clone.pathname = '/b'
    clone.searchParams.append('x', '3')
    expect(clone.search).toBe('?x=1&x=2&x=3')
    expect(formatRelativeURL(original)).toBe('/a?x=1&x=2')
    clone.search = '?q=a%20b'
    expect(clone.searchParams.get('q')).toBe('a b')
  })

  it('uses WHATWG path normalization', () => {
    expect(parseRequestPath('/a/../b').pathname).toBe('/b')
    expect(parseRequestPath('/a%2Fb').pathname).toBe('/a%2Fb')
  })

  it('only accepts paths in the path parser', () => {
    expect(() => parseRequestPath('https://example.org/a')).toThrow(TypeError)
    expect(() => parseRequestPath('./a')).toThrow(TypeError)
  })

  it('explicitly discards the origin at request ingress', () => {
    const url = tryParseRequestURL('https://example.org/a?x=1')!
    expect(formatRelativeURL(url)).toBe('/a?x=1')
    expect(tryParseRequestURL('http://[')).toBeUndefined()
  })
})
