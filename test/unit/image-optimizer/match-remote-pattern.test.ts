/* eslint-env jest */
import {
  matchRemotePattern as m,
  hasMatch,
} from 'next/dist/shared/lib/match-remote-pattern'

describe('matchRemotePattern', () => {
  it('should match literal hostname', () => {
    const p = { hostname: 'example.com' } as const
    expect(m(p, new URL('https://example.com'))).toBe(true)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.net'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com/path'))).toBe(true)
    expect(m(p, new URL('https://example.com/path/to'))).toBe(true)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:81/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:81/path/to/file?q=1'))).toBe(true)
    expect(m(p, new URL('http://example.com:81/path/to/file'))).toBe(true)
  })

  it('should match literal protocol and hostname', () => {
    const p = { protocol: 'https', hostname: 'example.com' } as const
    expect(m(p, new URL('https://example.com'))).toBe(true)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to'))).toBe(true)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:81/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:81/path/to/file?q=1'))).toBe(true)
    expect(m(p, new URL('http://example.com:81/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com:81/path/to/file'))).toBe(false)
  })

  it('should match literal protocol, hostname, no port', () => {
    const p = { protocol: 'https', hostname: 'example.com', port: '' } as const
    expect(m(p, new URL('https://example.com'))).toBe(true)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com/path/to/file?q=1'))).toBe(true)
    expect(m(p, new URL('http://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file?q=1'))).toBe(false)
    expect(m(p, new URL('http://example.com:81/path/to/file'))).toBe(false)
  })

  it('should match literal protocol, hostname, port 42', () => {
    const p = {
      protocol: 'https',
      hostname: 'example.com',
      port: '42',
    } as const
    expect(m(p, new URL('https://example.com:42'))).toBe(true)
    expect(m(p, new URL('https://example.com.uk:42'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com:42'))).toBe(false)
    expect(m(p, new URL('https://com:42'))).toBe(false)
    expect(m(p, new URL('https://example.com:42/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:42/path/to/file?q=1'))).toBe(true)
    expect(m(p, new URL('http://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to/file?q=1'))).toBe(false)
    expect(m(p, new URL('http://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file?q=1'))).toBe(false)
  })

  it('should match literal protocol, hostname, port, pathname', () => {
    const p = {
      protocol: 'https',
      hostname: 'example.com',
      port: '42',
      pathname: '/path/to/file',
    } as const
    expect(m(p, new URL('https://example.com:42'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk:42'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com:42'))).toBe(false)
    expect(m(p, new URL('https://example.com:42/path'))).toBe(false)
    expect(m(p, new URL('https://example.com:42/path/to'))).toBe(false)
    expect(m(p, new URL('https://example.com:42/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:42/path/to/file'))).toBe(true)
    expect(m(p, new URL('https://example.com:42/path/to/file?q=1'))).toBe(true)
    expect(m(p, new URL('http://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com:42/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com/path'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com/path/to/file?q=1'))).toBe(false)
    expect(m(p, new URL('http://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('ftp://example.com/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file'))).toBe(false)
    expect(m(p, new URL('https://example.com:81/path/to/file?q=1'))).toBe(false)
  })

  it('should match hostname pattern with single asterisk by itself', () => {
    const p = { hostname: 'avatars.*.example.com' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://avatars.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo1.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.iad1.example.com'))).toBe(true)
    expect(m(p, new URL('https://more.avatars.iad1.example.com'))).toBe(false)
  })

  it('should match hostname pattern with single asterisk at beginning', () => {
    const p = { hostname: 'avatars.*1.example.com' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://avatars.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo1.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.iad1.example.com'))).toBe(true)
    expect(m(p, new URL('https://more.avatars.iad1.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo2.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.iad2.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.1.example.com'))).toBe(true)
  })

  it('should match hostname pattern with single asterisk in middle', () => {
    const p = { hostname: 'avatars.*a*.example.com' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://avatars.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo1.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.iad1.example.com'))).toBe(true)
    expect(m(p, new URL('https://more.avatars.iad1.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo2.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.iad2.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.a.example.com'))).toBe(true)
  })

  it('should match hostname pattern with single asterisk at end', () => {
    const p = { hostname: 'avatars.ia*.example.com' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://avatars.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo1.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.iad1.example.com'))).toBe(true)
    expect(m(p, new URL('https://more.avatars.iad1.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.sfo2.example.com'))).toBe(false)
    expect(m(p, new URL('https://avatars.iad2.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.ia.example.com'))).toBe(true)
  })

  it('should match hostname pattern with double asterisk', () => {
    const p = { hostname: '**.example.com' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(true)
    expect(m(p, new URL('https://deep.sub.example.com'))).toBe(true)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://avatars.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.sfo1.example.com'))).toBe(true)
    expect(m(p, new URL('https://avatars.iad1.example.com'))).toBe(true)
    expect(m(p, new URL('https://more.avatars.iad1.example.com'))).toBe(true)
  })

  it('should match pathname pattern with single asterisk by itself', () => {
    const p = {
      hostname: 'example.com',
      pathname: '/act123/*/pic.jpg',
    } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/picsjpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr5/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr6/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/team/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act456/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/team/pic.jpg'))).toBe(false)
  })

  it('should match pathname pattern with single asterisk at the beginning', () => {
    const p = {
      hostname: 'example.com',
      pathname: '/act123/*4/pic.jpg',
    } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/picsjpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr5/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/team4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act456/team5/pic.jpg'))).toBe(
      false
    )
    expect(m(p, new URL('https://example.com/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/4/pic.jpg'))).toBe(true)
  })

  it('should match pathname pattern with single asterisk in the middle', () => {
    const p = {
      hostname: 'example.com',
      pathname: '/act123/*sr*/pic.jpg',
    } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/picsjpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr5/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/team4/pic.jpg'))).toBe(
      false
    )
    expect(m(p, new URL('https://example.com/act123/team5/pic.jpg'))).toBe(
      false
    )
    expect(m(p, new URL('https://example.com/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/sr/pic.jpg'))).toBe(true)
  })

  it('should match pathname pattern with single asterisk at the end', () => {
    const p = {
      hostname: 'example.com',
      pathname: '/act123/usr*/pic.jpg',
    } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/picsjpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123/usr4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr5/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/team4/pic.jpg'))).toBe(
      false
    )
    expect(m(p, new URL('https://example.com/act456/team5/pic.jpg'))).toBe(
      false
    )
    expect(m(p, new URL('https://example.com/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com/act123/usr6/pic.jpg'))).toBe(
      false
    )
  })

  it('should match pathname pattern with double asterisk', () => {
    const p = { hostname: 'example.com', pathname: '/act123/**' } as const
    expect(m(p, new URL('https://com'))).toBe(false)
    expect(m(p, new URL('https://example.com'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com'))).toBe(false)
    expect(m(p, new URL('https://example.com.uk'))).toBe(false)
    expect(m(p, new URL('https://example.com/act123'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr4'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr4/pic'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr4/picsjpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr4/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr5/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/usr6/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act123/team/pic.jpg'))).toBe(true)
    expect(m(p, new URL('https://example.com/act456/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://example.com/team/pic.jpg'))).toBe(false)
    expect(m(p, new URL('https://sub.example.com/act123/team/pic.jpg'))).toBe(
      false
    )
  })

  it('should throw when hostname is missing', () => {
    const p = { protocol: 'https' } as const
    // @ts-ignore testing invalid input
    expect(() => m(p, new URL('https://example.com'))).toThrow(
      'Pattern should define hostname but found\n{"protocol":"https"}'
    )
  })

  it('should properly work with hasMatch', () => {
    const url = new URL('https://example.com')
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
})
