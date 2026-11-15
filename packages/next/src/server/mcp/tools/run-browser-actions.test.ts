/**
 * @jest-environment node
 */

import {
  isAllowedRequestUrl,
  resolveSameOriginUrl,
} from './run-browser-actions'

describe('resolveSameOriginUrl', () => {
  const devServerUrl = 'http://localhost:3000'

  it('resolves relative paths against the dev server', () => {
    expect(resolveSameOriginUrl(devServerUrl, '/blog/1?x=1')).toBe(
      'http://localhost:3000/blog/1?x=1'
    )
  })

  it('allows absolute URLs on the same origin', () => {
    expect(resolveSameOriginUrl(devServerUrl, 'http://localhost:3000/a')).toBe(
      'http://localhost:3000/a'
    )
  })

  it.each([
    'http://169.254.169.254/latest/meta-data',
    'https://example.com',
    '//example.com/path',
    'http://localhost:4000/',
  ])('rejects navigation away from the dev server: %s', (path) => {
    expect(() => resolveSameOriginUrl(devServerUrl, path)).toThrow(
      /not allowed/
    )
  })
})

describe('isAllowedRequestUrl', () => {
  const devServerUrl = 'http://localhost:3000'

  it.each([
    'http://localhost:3000/',
    'http://localhost:3000/_next/static/chunk.js',
    'ws://localhost:3000/_next/webpack-hmr',
    'data:text/plain,hello',
    'blob:http://localhost:3000/abc',
    'about:blank',
  ])('allows %s', (url) => {
    expect(isAllowedRequestUrl(devServerUrl, url)).toBe(true)
  })

  it.each([
    'http://127.0.0.1:3000/',
    'http://localhost:4000/',
    'https://localhost:3000/',
    'http://169.254.169.254/latest/meta-data',
    'https://example.com/',
    'ftp://localhost:3000/file',
    'not a url',
  ])('blocks %s', (url) => {
    expect(isAllowedRequestUrl(devServerUrl, url)).toBe(false)
  })
})
