import { createHrefFromUrl } from './create-href-from-url'

describe('createHrefFromUrl', () => {
  it('returns a string', () => {
    const url = new URL('https://example.com/')
    expect(createHrefFromUrl(url)).toBe('/')
  })

  it('adds hash', () => {
    const url = new URL('https://example.com/#hash')
    expect(createHrefFromUrl(url)).toBe('/#hash')
  })

  it('adds searchParams', () => {
    const url = new URL('https://example.com/?a=1&b=2')
    expect(createHrefFromUrl(url)).toBe('/?a=1&b=2')
  })

  it('adds pathname', () => {
    const url = new URL('https://example.com/path')
    expect(createHrefFromUrl(url)).toBe('/path')
  })

  it('adds pathname, searchParams, and hash', () => {
    const url = new URL('https://example.com/path?a=1&b=2#hash')
    expect(createHrefFromUrl(url)).toBe('/path?a=1&b=2#hash')
  })
})
