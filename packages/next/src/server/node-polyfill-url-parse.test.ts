/* eslint-env jest */
import './node-polyfill-url-parse'

describe('node-polyfill-url-parse', () => {
  test('URL.parse exists', async () => {
    expect(typeof URL.parse).toBe('function')
  })

  test('parses a valid URL', async () => {
    const url = URL.parse('https://vercel.com')
    expect(url).not.toBeNull()
    expect(url?.hostname).toBe('vercel.com')
  })

  test('resolves relative URLs against a base', async () => {
    const url = URL.parse('/docs', 'https://nextjs.org')
    expect(url).not.toBeNull()
    expect(url?.href).toBe('https://nextjs.org/docs')
  })

  test('returns null instead of throwing for an invalid URL', async () => {
    expect(URL.parse('not a url')).toBeNull()
  })
})
