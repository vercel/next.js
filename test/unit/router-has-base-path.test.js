/* eslint-env jest */

describe('router hasBasePath', () => {
  let hasBasePath
  beforeEach(() => {
    jest.resetModules()
    hasBasePath = require('next/dist/next-server/lib/router/router').hasBasePath
  })
  describe('with no basePath', () => {
    beforeEach(() => {
      process.env.__NEXT_ROUTER_BASEPATH = undefined
    })
    it('detects basePath with any URL', () => {
      expect(hasBasePath('/hello')).toBe(true)
    })
  })
  describe('with basePath', () => {
    beforeEach(() => {
      process.env.__NEXT_ROUTER_BASEPATH = '/base/path'
    })
    it('returns false for path outside of basePath', () => {
      expect(hasBasePath('/hello')).toBe(false)
    })
    it('detects basePath for homepage', () => {
      expect(hasBasePath('/base/path')).toBe(true)
    })
    it('detects basePath for subpage', () => {
      expect(hasBasePath('/base/path/hello')).toBe(true)
    })
    it('returns false for path with part of basePath', () => {
      expect(hasBasePath('/base/path-it-is-not')).toBe(false)
    })
    it('detects basePath on subpage with query string', () => {
      expect(hasBasePath('/base/path/hello?some=query')).toBe(true)
    })
    it('detects basePath on homepage with query string', () => {
      expect(hasBasePath('/base/path?some=query')).toBe(true)
    })
  })
})
