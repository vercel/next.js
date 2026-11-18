import { getHostname } from './get-hostname'

describe('getHostname', () => {
  describe('from URL', () => {
    it.each([
      { url: 'http://example.com', hostname: 'example.com' },
      { url: 'http://example.com/', hostname: 'example.com' },
      { url: 'http://example.com:3000', hostname: 'example.com' },
      { url: 'https://example.com', hostname: 'example.com' },
      { url: 'https://example.com/', hostname: 'example.com' },
      { url: 'https://example.com:3000', hostname: 'example.com' },
      { url: 'http://localhost', hostname: 'localhost' },
      { url: 'http://localhost/', hostname: 'localhost' },
      { url: 'http://localhost:3000', hostname: 'localhost' },
      { url: 'http://127.0.0.1', hostname: '127.0.0.1' },
      { url: 'http://127.0.0.1/', hostname: '127.0.0.1' },
      { url: 'http://127.0.0.1:3000', hostname: '127.0.0.1' },
      { url: 'http://8.8.8.8', hostname: '8.8.8.8' },
      { url: 'http://8.8.8.8/', hostname: '8.8.8.8' },
      { url: 'http://8.8.8.8:3000', hostname: '8.8.8.8' },
    ])('should return $hostname for $url', ({ url, hostname }) => {
      const parsed = new URL(url)

      // Base case.
      expect(getHostname(parsed)).toBe(hostname)
      // With headers.
      expect(getHostname(parsed, { host: parsed.host })).toBe(hostname)
      // With an empty headers array.
      // @ts-expect-error passing an array of strings is not allowed
      expect(getHostname(parsed, { host: [] })).toBe(hostname)
      // With a headers array.
      // @ts-expect-error passing an array of strings is not allowed
      expect(getHostname({}, { host: [parsed.host] })).toBe(undefined)
    })
  })

  describe('IPv6 host', () => {
    it.each([
      { url: 'http://[::1]', hostname: '[::1]' },
      { url: 'http://[::1]/', hostname: '[::1]' },
      { url: 'http://[::1]:3000', hostname: '[::1]' },
      { url: 'http://[2001:db8::1]', hostname: '[2001:db8::1]' },
      { url: 'http://[2001:db8::1]:8080', hostname: '[2001:db8::1]' },
      // IPv6 is case-insensitive and should be normalized.
      { url: 'http://[2001:DB8::1]:8080', hostname: '[2001:db8::1]' },
    ])('should return $hostname for $url', ({ url, hostname }) => {
      const parsed = new URL(url)

      // From the parsed URL.
      expect(getHostname(parsed)).toBe(hostname)
      // From the `host` header, which must match the parsed URL result so both
      // code paths agree on the same hostname.
      expect(getHostname({}, { host: parsed.host })).toBe(hostname)
    })
  })

  it('should return undefined for empty input', () => {
    expect(getHostname({})).toBe(undefined)
    // @ts-expect-error passing an array of strings is not allowed
    expect(getHostname({}, { host: [] })).toBe(undefined)
  })
})
