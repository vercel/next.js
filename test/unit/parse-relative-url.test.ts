/* eslint-env jest */
import { parseRelativeUrl } from 'next/dist/shared/lib/router/utils/parse-relative-url'

// convenience function so tests can be aligned neatly
// and easy to eyeball
const check = (windowUrl, targetUrl, expected) => {
  window.location = new URL(windowUrl) as any
  if (typeof expected === 'string') {
    expect(() => parseRelativeUrl(targetUrl)).toThrow(expected)
  } else {
    const parsedUrl = parseRelativeUrl(targetUrl)
    expect(parsedUrl.pathname).toBe(expected.pathname)
    expect(parsedUrl.search).toBe(expected.search)
    expect(parsedUrl.hash).toBe(expected.hash)
  }
}

describe('parseRelativeUrl', () => {
  beforeAll(() => {
    ;(global as any).window = {
      location: {},
    }
  })

  afterAll(() => {
    delete (global as any).window
  })

  it('should parse relative url', () => {
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      '/someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
  })

  it('should parse relative url when start with dot', () => {
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      './someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someA/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
    check(
      'http://example.com:3210/someA/pathB',
      '../someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
    check(
      'http://example.com:3210/someA/pathB',
      '../../someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
  })

  it('should parse relative url on special protocol', () => {
    check(
      'ionic://localhost/someA/pathB?fooC=barD#hashE',
      '/someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
    check(
      'file:///someA/pathB?fooC=barD#hashE',
      '/someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
  })

  it('should parse the full url with current origin', () => {
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      'http://example.com:3210/someF/pathG?fooH=barI#hashJ',
      {
        pathname: '/someF/pathG',
        search: '?fooH=barI',
        hash: '#hashJ',
      }
    )
  })

  it('should throw when parsing the full url with diff origin', () => {
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      'http://google.com/someF/pathG?fooH=barI#hashJ',
      'invariant: invalid relative URL'
    )
  })

  it('should throw when parsing the special prefix', () => {
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      'mailto:foo@example.com',
      'invariant: invalid relative URL'
    )
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      'tel:+123456789',
      'invariant: invalid relative URL'
    )
    check(
      'http://example.com:3210/someA/pathB?fooC=barD#hashE',
      'sms:+123456789',
      'invariant: invalid relative URL'
    )
  })
})
