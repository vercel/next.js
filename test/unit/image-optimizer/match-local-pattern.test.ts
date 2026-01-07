/* eslint-env jest */
import type { LocalPattern } from 'next/dist/shared/lib/image-config'
import {
  matchLocalPattern,
  hasLocalMatch as hasMatch,
} from 'next/dist/shared/lib/match-local-pattern'

const m = (p: LocalPattern, urlPathAndQuery: string) =>
  matchLocalPattern(p, new URL(urlPathAndQuery, 'http://n'))

describe('matchLocalPattern', () => {
  it('should match anything when no pattern is defined', () => {
    const p = {} as const
    expect(m(p, '/')).toBe(true)
    expect(m(p, '/path')).toBe(true)
    expect(m(p, '/path/to')).toBe(true)
    expect(m(p, '/path/to/file')).toBe(true)
    expect(m(p, '/path/to/file.txt')).toBe(true)
    expect(m(p, '/path/to/file?q=1')).toBe(true)
    expect(m(p, '/path/to/file?q=1&a=two')).toBe(true)
  })

  it('should match any path without a search query string', () => {
    const p = {
      search: '',
    } as const
    expect(m(p, '/')).toBe(true)
    expect(m(p, '/path')).toBe(true)
    expect(m(p, '/path/to')).toBe(true)
    expect(m(p, '/path/to/file')).toBe(true)
    expect(m(p, '/path/to/file.txt')).toBe(true)
    expect(m(p, '/path/to/file?q=1')).toBe(false)
    expect(m(p, '/path/to/file?q=1&a=two')).toBe(false)
    expect(m(p, '/path/to/file.txt?q=1&a=two')).toBe(false)
  })

  it('should match literal pathname and any search query string', () => {
    const p = {
      pathname: '/path/to/file',
    } as const
    expect(m(p, '/')).toBe(false)
    expect(m(p, '/path')).toBe(false)
    expect(m(p, '/path/to')).toBe(false)
    expect(m(p, '/path/to/file')).toBe(true)
    expect(m(p, '/path/to/file.txt')).toBe(false)
    expect(m(p, '/path/to/file?q=1')).toBe(true)
    expect(m(p, '/path/to/file?q=1&a=two')).toBe(true)
    expect(m(p, '/path/to/file.txt?q=1&a=two')).toBe(false)
  })

  it('should match pathname with double asterisk', () => {
    const p = {
      pathname: '/path/to/**',
    } as const
    expect(m(p, '/')).toBe(false)
    expect(m(p, '/path')).toBe(false)
    expect(m(p, '/path/to')).toBe(true)
    expect(m(p, '/path/to/file')).toBe(true)
    expect(m(p, '/path/to/file.txt')).toBe(true)
    expect(m(p, '/path/to/file?q=1')).toBe(true)
    expect(m(p, '/path/to/file?q=1&a=two')).toBe(true)
    expect(m(p, '/path/to/file.txt?q=1&a=two')).toBe(true)
  })

  it('should properly work with hasMatch', () => {
    const url = '/path/to/file?q=1&a=two'
    expect(hasMatch(undefined, url)).toBe(true)
    expect(hasMatch([], url)).toBe(false)
    expect(hasMatch([{ pathname: '/path' }], url)).toBe(false)
    expect(hasMatch([{ pathname: '/path/to' }], url)).toBe(false)
    expect(hasMatch([{ pathname: '/path/to/file' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/to/file' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/to/file', search: '' }], url)).toBe(
      false
    )
    expect(hasMatch([{ pathname: '/path/to/file', search: '?q=1' }], url)).toBe(
      false
    )
    expect(
      hasMatch([{ pathname: '/path/to/file', search: '?q=1&a=two' }], url)
    ).toBe(true)
    expect(hasMatch([{ pathname: '/path/**' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/to/**' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/to/f*' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/to/*le' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/path/*/file' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/*/to/file' }], url)).toBe(true)
    expect(hasMatch([{ pathname: '/foo' }, { pathname: '/bar' }], url)).toBe(
      false
    )
    expect(
      hasMatch(
        [{ pathname: '/foo' }, { pathname: '/bar' }, { pathname: '/path/**' }],
        url
      )
    ).toBe(true)
  })
})
