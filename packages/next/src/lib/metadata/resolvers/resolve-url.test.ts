import { resolveUrl } from './resolve-url'

describe('Test metadata resolveUrl', () => {
  it('should return null when url is falsy', () => {
    expect(resolveUrl('', null)).toBe(null)
    expect(resolveUrl(null, null)).toBe(null)
    expect(resolveUrl(undefined, null)).toBe(null)
  })

  it('should return url itself when metadataBase is null or url is valid URL', () => {
    expect(resolveUrl('/abc', null)).toBe('/abc')
    expect(resolveUrl('https://example.com/abc', null)).toEqual(
      new URL('https://example.com/abc')
    )
    expect(resolveUrl(new URL('https://example.com/def'), null)).toEqual(
      new URL('https://example.com/def')
    )
  })
})
