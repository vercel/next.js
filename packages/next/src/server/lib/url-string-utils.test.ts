import { getPathnameFromUrl, getQueryParamFromUrl } from './url-string-utils'

describe('getPathnameFromUrl', () => {
  it('returns pathname from a simple path', () => {
    expect(getPathnameFromUrl('/foo/bar')).toBe('/foo/bar')
  })

  it('strips query string', () => {
    expect(getPathnameFromUrl('/foo?a=1&b=2')).toBe('/foo')
  })

  it('strips hash fragment', () => {
    expect(getPathnameFromUrl('/foo#section')).toBe('/foo')
  })

  it('strips both query and hash', () => {
    expect(getPathnameFromUrl('/foo?a=1#section')).toBe('/foo')
  })

  it('handles hash before query', () => {
    expect(getPathnameFromUrl('/foo#section?a=1')).toBe('/foo')
  })

  it('returns "/" for empty string', () => {
    expect(getPathnameFromUrl('')).toBe('/')
  })

  it('returns "/" for undefined', () => {
    expect(getPathnameFromUrl(undefined)).toBe('/')
  })

  it('returns "/" for root path', () => {
    expect(getPathnameFromUrl('/')).toBe('/')
  })

  it('handles root with query', () => {
    expect(getPathnameFromUrl('/?_rsc=abc')).toBe('/')
  })
})

describe('getQueryParamFromUrl', () => {
  it('returns the value of a query parameter', () => {
    expect(getQueryParamFromUrl('/path?_rsc=abc123', '_rsc')).toBe('abc123')
  })

  it('returns the first occurrence when param appears multiple times', () => {
    expect(getQueryParamFromUrl('/path?a=1&a=2', 'a')).toBe('1')
  })

  it('returns null when param is absent', () => {
    expect(getQueryParamFromUrl('/path?other=1', '_rsc')).toBeNull()
  })

  it('returns null when there is no query string', () => {
    expect(getQueryParamFromUrl('/path', '_rsc')).toBeNull()
  })

  it('returns null for undefined url', () => {
    expect(getQueryParamFromUrl(undefined, '_rsc')).toBeNull()
  })

  it('returns empty string for empty value', () => {
    expect(getQueryParamFromUrl('/path?_rsc=', '_rsc')).toBe('')
  })

  it('handles param at the end of query string', () => {
    expect(getQueryParamFromUrl('/path?a=1&_rsc=xyz', '_rsc')).toBe('xyz')
  })

  it('does not match partial param names', () => {
    // "x_rsc=bad" should not match "_rsc"
    expect(getQueryParamFromUrl('/path?x_rsc=bad&_rsc=good', '_rsc')).toBe(
      'good'
    )
  })

  it('decodes percent-encoded values', () => {
    expect(getQueryParamFromUrl('/path?q=hello%20world', 'q')).toBe(
      'hello world'
    )
  })

  it('stops at hash fragment', () => {
    expect(getQueryParamFromUrl('/path?a=1#hash', 'a')).toBe('1')
  })

  it('returns empty string for value-less param (no =)', () => {
    expect(getQueryParamFromUrl('/path?_rsc', '_rsc')).toBe('')
  })

  it('returns empty string for value-less param in the middle', () => {
    expect(getQueryParamFromUrl('/path?a=1&_rsc&b=2', '_rsc')).toBe('')
  })

  it('returns empty string for value-less param at the end', () => {
    expect(getQueryParamFromUrl('/path?a=1&_rsc', '_rsc')).toBe('')
  })

  it('returns empty string for value-less param before hash', () => {
    expect(getQueryParamFromUrl('/path?_rsc#hash', '_rsc')).toBe('')
  })

  it('does not match partial param names for value-less params', () => {
    expect(getQueryParamFromUrl('/path?x_rsc', '_rsc')).toBeNull()
  })
})
