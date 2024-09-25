/* eslint-env jest */
import type { LocalPattern } from 'next/dist/shared/lib/image-config'
import {
  matchLocalPattern,
  hasLocalMatch as hasMatch,
} from 'next/dist/shared/lib/match-local-pattern'

const m = (p: LocalPattern, urlPathAndQuery: string) => matchLocalPattern(p, new URL(urlPathAndQuery, 'http://n'))

describe('matchLocalPattern', () => {

  it('should match anything when no pattern is defined', () => {
    const p = {} as const
    expect(m(p, ('/'))).toBe(true)
    expect(m(p, ('/path'))).toBe(true)
    expect(m(p, ('/path/to'))).toBe(true)
    expect(m(p, ('/path/to/file'))).toBe(true)
    expect(m(p, ('/path/to/file.txt'))).toBe(true)
    expect(m(p, ('/path/to/file?q=1'))).toBe(false)
    expect(m(p, ('/path/to/file?q=1&a=two'))).toBe(false)
  })

  it('should match literal pathname and any search query string', () => {
    const p = {
      pathname: '/path/to/file',
    } as const
    expect(m(p, ('/'))).toBe(false)
    expect(m(p, ('/path'))).toBe(false)
    expect(m(p, ('/path/to'))).toBe(false)
    expect(m(p, ('/path/to/file'))).toBe(true)
    expect(m(p, ('/path/to/file.txt'))).toBe(false)
    expect(m(p, ('/path/to/file?q=1'))).toBe(true)
    expect(m(p, ('/path/to/file?q=1&a=two'))).toBe(true)
  })

  it('should match any path without a search query string', () => {
    const p = {
      search: '',
    } as const
    expect(m(p, ('/'))).toBe(true)
    expect(m(p, ('/path'))).toBe(true)
    expect(m(p, ('/path/to'))).toBe(true)
    expect(m(p, ('/path/to/file'))).toBe(true)
    expect(m(p, ('/path/to/file.txt'))).toBe(true)
    expect(m(p, ('/path/to/file?q=1'))).toBe(false)
    expect(m(p, ('/path/to/file?q=1&a=two'))).toBe(false)
  })

  /*

  it('should match literal protocol, hostname, port, pathname, search', () => {
    const p = {
      protocol: 'https',
      hostname: 'example.com',
      port: '42',
      pathname: '/path/to/file',
      search: '?q=1&a=two&s=!@$^&-_+/()[]{};:~',
    } as const
    expect(m(p, (':42'))).toBe(false)
    expect(m(p, ('.uk:42'))).toBe(false)
    expect(m(p, ('https://sub.example.com:42'))).toBe(false)
    expect(m(p, (':42/path'))).toBe(false)
    expect(m(p, (':42/path/to'))).toBe(false)
    expect(m(p, (':42/file'))).toBe(false)
    expect(m(p, (':42/path/to/file'))).toBe(false)
    expect(m(p, ('http://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, ('ftp://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, (''))).toBe(false)
    expect(m(p, ('.uk'))).toBe(false)
    expect(m(p, ('https://sub.example.com'))).toBe(false)
    expect(m(p, ('/path'))).toBe(false)
    expect(m(p, ('/path/to'))).toBe(false)
    expect(m(p, ('/path/to/file'))).toBe(false)
    expect(m(p, ('/path/to/file?q=1'))).toBe(false)
    expect(m(p, ('http://example.com/path/to/file'))).toBe(false)
    expect(m(p, ('ftp://example.com/path/to/file'))).toBe(false)
    expect(m(p, (':81/path/to/file'))).toBe(false)
    expect(m(p, (':81/path/to/file?q=1'))).toBe(false)
    expect(m(p, (':42/path/to/file?q=1'))).toBe(false)
    expect(m(p, (':42/path/to/file?q=1&a=two'))).toBe(
      false
    )
    expect(
      m(p, (':42/path/to/file?q=1&a=two&s'))
    ).toBe(false)
    expect(
      m(p, (':42/path/to/file?q=1&a=two&s='))
    ).toBe(false)
    expect(
      m(p, (':42/path/to/file?q=1&a=two&s=!@'))
    ).toBe(false)
    expect(
      m(
        p,
        (
          ':42/path/to/file?q=1&a=two&s=!@$^&-_+/()[]{};:~'
        )
      )
    ).toBe(true)
    expect(
      m(
        p,
        (
          ':42/path/to/file?q=1&s=!@$^&-_+/()[]{};:~&a=two'
        )
      )
    ).toBe(false)
    expect(
      m(
        p,
        (
          ':42/path/to/file?a=two&q=1&s=!@$^&-_+/()[]{};:~'
        )
      )
    ).toBe(false)
  })

  it('should properly work with hasMatch', () => {
    const url = ('')
    expect(hasMatch([], [], url)).toBe(false)
    expect(hasMatch(['foo.com'], [], url)).toBe(false)
    expect(hasMatch(['example.com'], [], url)).toBe(true)
    expect(hasMatch(['**.example.com'], [], url)).toBe(false)
    expect(hasMatch(['*.example.com'], [], url)).toBe(false)
    expect(hasMatch(['*.example.com'], [], url)).toBe(false)
    expect(hasMatch([], [{ hostname: 'foo.com' }], url)).toBe(false)
    expect(
      hasMatch([], [{ hostname: 'foo.com' }, { hostname: 'example.com' }], url)
    ).toBe(true)
    expect(
      hasMatch([], [{ hostname: 'example.com', pathname: '/act123/**' }], url)
    ).toBe(false)
    expect(
      hasMatch(
        ['example.com'],
        [{ hostname: 'example.com', pathname: '/act123/**' }],
        url
      )
    ).toBe(true)
    expect(
      hasMatch([], [{ protocol: 'https', hostname: 'example.com' }], url)
    ).toBe(true)
    expect(
      hasMatch([], [{ protocol: 'http', hostname: 'example.com' }], url)
    ).toBe(false)
    expect(
      hasMatch(
        ['example.com'],
        [{ protocol: 'http', hostname: 'example.com' }],
        url
      )
    ).toBe(true)
    expect(
      hasMatch(
        ['foo.com'],
        [{ protocol: 'http', hostname: 'example.com' }],
        url
      )
    ).toBe(false)
  })

  */
})
