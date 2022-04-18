/* eslint-env jest */
import { matchRemotePattern } from 'next/dist/server/image-optimizer'

describe('matchRemotePattern', () => {
  it('should match literal hostname', () => {
    const p = { hostname: 'example.com' }
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(true)
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.net'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com/path'))).toBe(
      true
    )
    expect(matchRemotePattern(p, new URL('https://example.com/path/to'))).toBe(
      true
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://example.com:8080/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com:8080/path/to/file?q=1')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('http://example.com:8080/path/to/file'))
    ).toBe(true)
  })

  it('should match literal protocol and hostname', () => {
    const p = { protocol: 'https', hostname: 'example.com' }
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(true)
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com/path/to'))).toBe(
      true
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://example.com:8080/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com:8080/path/to/file?q=1')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('http://example.com:8080/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com:8080/path/to/file'))
    ).toBe(false)
  })

  it('should match literal protocol, hostname, no port', () => {
    const p = { protocol: 'https', hostname: 'example.com', port: '' }
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(true)
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file?q=1'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('http://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com:8080/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com:8080/path/to/file?q=1')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('http://example.com:8080/path/to/file'))
    ).toBe(false)
  })

  it('should match literal protocol, hostname, port 5000', () => {
    const p = { protocol: 'https', hostname: 'example.com', port: '5000' }
    expect(matchRemotePattern(p, new URL('https://example.com:5000'))).toBe(
      true
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk:5000'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://sub.example.com:5000'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://com:5000'))).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com:5000/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com:5000/path/to/file?q=1')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('http://example.com:5000/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com:5000/path/to/file'))
    ).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file?q=1'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('http://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com/path/to/file'))
    ).toBe(false)
  })

  it('should match literal protocol, hostname, port, pathname', () => {
    const p = {
      protocol: 'https',
      hostname: 'example.com',
      port: '5000',
      pathname: '/path/to/file',
    }
    expect(matchRemotePattern(p, new URL('https://example.com:5000'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk:5000'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://sub.example.com:5000'))).toBe(
      false
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com:5000/path'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com:5000/path/to'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com:5000/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com:5000/path/to/file'))
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com:5000/path/to/file?q=1')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('http://example.com:5000/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com:5000/path/to/file'))
    ).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com/path'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com/path/to'))).toBe(
      false
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/path/to/file?q=1'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('http://example.com/path/to/file'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('ftp://example.com/path/to/file'))
    ).toBe(false)
  })

  it('should match hostname pattern with single asterisk', () => {
    const p = { hostname: 'avatars.*.example.com' }
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com.uk'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://avatars.example.com'))).toBe(
      false
    )
    expect(
      matchRemotePattern(p, new URL('https://avatars.sfo1.example.com'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://avatars.iad1.example.com'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://more.avatars.iad1.example.com'))
    ).toBe(false)
  })

  it('should match hostname pattern with double asterisk', () => {
    const p = { hostname: '**.example.com' }
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(true)
    expect(matchRemotePattern(p, new URL('https://deep.sub.example.com'))).toBe(
      true
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com.uk'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://avatars.example.com'))).toBe(
      true
    )
    expect(
      matchRemotePattern(p, new URL('https://avatars.sfo1.example.com'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://avatars.iad1.example.com'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://more.avatars.iad1.example.com'))
    ).toBe(true)
  })

  it('should match pathname pattern with single asterisk', () => {
    const p = { hostname: 'example.com', pathname: '/act123/*/avatar.jpg' }
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com/act123'))).toBe(
      false
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com/act123/usr4'))
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/act123/usr4/avatar'))
    ).toBe(false)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr4/avatarsjpg')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr4/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr5/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr6/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/team/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act456/team/avatar.jpg')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/team/avatar.jpg'))
    ).toBe(false)
  })

  it('should match pathname pattern with double asterisk', () => {
    const p = { hostname: 'example.com', pathname: '/act123/**' }
    expect(matchRemotePattern(p, new URL('https://com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://sub.example.com'))).toBe(
      false
    )
    expect(matchRemotePattern(p, new URL('https://example.com.uk'))).toBe(false)
    expect(matchRemotePattern(p, new URL('https://example.com/act123'))).toBe(
      false
    )
    expect(
      matchRemotePattern(p, new URL('https://example.com/act123/usr4'))
    ).toBe(true)
    expect(
      matchRemotePattern(p, new URL('https://example.com/act123/usr4/avatar'))
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr4/avatarsjpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr4/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr5/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/usr6/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act123/team/avatar.jpg')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        p,
        new URL('https://example.com/act456/team/avatar.jpg')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(p, new URL('https://example.com/team/avatar.jpg'))
    ).toBe(false)
  })
})
