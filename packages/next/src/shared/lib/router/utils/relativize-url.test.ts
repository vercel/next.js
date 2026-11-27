/* eslint-env jest */
import { getRelativeURL, parseRelativeURL } from './relativize-url'

describe('getRelativeURL', () => {
  it('treats a loopback rewrite as relative when the server binds to another loopback spelling', () => {
    // The router builds its base from the bind address (127.0.0.1), while
    // NextURL canonicalizes loopback hosts to `localhost` inside middleware.
    const initUrl = 'http://127.0.0.1:3115/a'
    const rewrite = 'http://localhost:3115/b'

    expect(getRelativeURL(rewrite, initUrl)).toBe('/b')
    expect(parseRelativeURL(rewrite, initUrl)).toEqual({
      url: '/b',
      isRelative: true,
    })
  })

  it('works in the reverse loopback direction and with IPv6 loopback', () => {
    expect(
      getRelativeURL('http://127.0.0.1:3115/b', 'http://localhost:3115/a')
    ).toBe('/b')
    expect(
      getRelativeURL('http://[::1]:3115/b', 'http://localhost:3115/a')
    ).toBe('/b')
  })

  it('keeps non-loopback and cross-origin URLs absolute', () => {
    expect(
      getRelativeURL('http://0.0.0.0:3115/b', 'http://0.0.0.0:3115/a')
    ).toBe('/b')
    expect(
      getRelativeURL('http://example.com:3115/b', 'http://127.0.0.1:3115/a')
    ).toBe('http://example.com:3115/b')
    expect(
      getRelativeURL('https://localhost:3115/b', 'http://127.0.0.1:3115/a')
    ).toBe('https://localhost:3115/b')
  })
})
