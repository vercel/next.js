/* eslint-env jest */
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url'

describe('formatUrl', () => {
  it('preserves all colons in auth (multi-colon regression)', () => {
    expect(
      formatUrl({
        protocol: 'http',
        host: 'example.com',
        auth: 'user:pa:ss',
        pathname: '/',
      })
    ).toBe('http://user:pa:ss@example.com/')
  })

  it('formats single-colon auth', () => {
    expect(
      formatUrl({
        protocol: 'http',
        host: 'example.com',
        auth: 'user:pass',
        pathname: '/',
      })
    ).toBe('http://user:pass@example.com/')
  })

  it('encodes an @ in auth while keeping the colon separator', () => {
    expect(
      formatUrl({
        protocol: 'http',
        host: 'example.com',
        auth: 'user@name:pass',
        pathname: '/',
      })
    ).toContain('user%40name:pass@')
  })

  it('formats a basic url with a query object', () => {
    expect(
      formatUrl({
        protocol: 'https',
        host: 'example.com',
        pathname: '/a',
        query: { b: 'c' },
      })
    ).toBe('https://example.com/a?b=c')
  })

  it('normalizes a hash without a leading #', () => {
    expect(
      formatUrl({ protocol: 'https', host: 'x.com', hash: 'top' })
    ).toMatch(/#top$/)
  })
})
