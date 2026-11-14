import { hasRemoteMatch, matchRemotePattern } from './match-remote-pattern'

describe('matchRemotePattern', () => {
  it('matches hostnames case-insensitively', () => {
    // `url.hostname` is always lowercased by the URL parser, but hostnames are
    // case-insensitive (RFC 4343), so a mixed-case pattern must still match.
    expect(
      matchRemotePattern(
        { hostname: 'CDN.Example.COM' },
        new URL('https://cdn.example.com/image.png')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        { hostname: '*.Example.com' },
        new URL('https://assets.example.com/image.png')
      )
    ).toBe(true)
    expect(
      matchRemotePattern(
        { hostname: '**.Example.COM' },
        new URL('https://a.b.example.com/image.png')
      )
    ).toBe(true)
  })

  it('still rejects non-matching hostnames', () => {
    expect(
      matchRemotePattern(
        { hostname: 'CDN.Example.COM' },
        new URL('https://other.com/image.png')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(
        { hostname: '*.Example.com' },
        new URL('https://example.com.evil.com/image.png')
      )
    ).toBe(false)
  })

  it('still applies the other pattern fields', () => {
    expect(
      matchRemotePattern(
        { protocol: 'https', hostname: 'CDN.Example.com' },
        new URL('http://cdn.example.com/image.png')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(
        { hostname: 'CDN.Example.com', pathname: '/photos/**' },
        new URL('https://cdn.example.com/other/image.png')
      )
    ).toBe(false)
    expect(
      matchRemotePattern(
        { hostname: 'CDN.Example.com', pathname: '/photos/**' },
        new URL('https://cdn.example.com/photos/image.png')
      )
    ).toBe(true)
  })
})

describe('hasRemoteMatch', () => {
  it('matches domains case-insensitively', () => {
    expect(
      hasRemoteMatch(
        ['CDN.Example.COM'],
        [],
        new URL('https://cdn.example.com/image.png')
      )
    ).toBe(true)
    expect(
      hasRemoteMatch(['example.com'], [], new URL('https://other.com/x'))
    ).toBe(false)
  })
})
