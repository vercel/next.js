import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from './interception-routes'

describe('Interception Route helper', () => {
  describe('isInterceptionRouteAppPath', () => {
    it('should validate correct paths', () => {
      expect(isInterceptionRouteAppPath('/foo/(..)/bar')).toBe(true)
      expect(isInterceptionRouteAppPath('/foo/(...)/bar')).toBe(true)
      expect(isInterceptionRouteAppPath('/foo/(..)(..)/bar')).toBe(true)
      expect(isInterceptionRouteAppPath('/foo/(.)bar')).toBe(true)
    })
    it('should not validate incorrect paths', () => {
      expect(isInterceptionRouteAppPath('/foo/(..')).toBe(false)
      expect(isInterceptionRouteAppPath('/foo/..)/bar')).toBe(false)
      expect(isInterceptionRouteAppPath('/foo')).toBe(false)
    })
  })
  describe('extractInterceptionRouteInformation', () => {
    it('should extract correct information', () => {
      expect(extractInterceptionRouteInformation('/foo/(..)bar')).toEqual({
        interceptingRoute: '/foo',
        interceptedRoute: '/bar',
      })

      expect(extractInterceptionRouteInformation('/foo/(...)bar')).toEqual({
        interceptingRoute: '/foo',
        interceptedRoute: '/bar',
      })

      expect(
        extractInterceptionRouteInformation('/foo/bar/(..)(..)baz')
      ).toEqual({ interceptingRoute: '/foo/bar', interceptedRoute: '/baz' })

      expect(
        extractInterceptionRouteInformation('/foo/(group)/bar/(..)(..)baz')
      ).toEqual({ interceptingRoute: '/foo/bar', interceptedRoute: '/baz' })

      expect(
        extractInterceptionRouteInformation('/foo/bar/@modal/(..)(..)baz')
      ).toEqual({ interceptingRoute: '/foo/bar', interceptedRoute: '/baz' })

      expect(extractInterceptionRouteInformation('/foo/bar/(.)baz')).toEqual({
        interceptingRoute: '/foo/bar',
        interceptedRoute: '/foo/bar/baz',
      })
    })
    it('should not extract incorrect information', () => {
      expect(() =>
        extractInterceptionRouteInformation('/foo/(..')
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid interception route: /foo/(... Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>"`
      )
      expect(() =>
        extractInterceptionRouteInformation('/foo/..)/bar')
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid interception route: /foo/..)/bar. Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>"`
      )
      expect(() =>
        extractInterceptionRouteInformation('/foo')
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid interception route: /foo. Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>"`
      )
    })
    it('should check the segment length', () => {
      expect(() =>
        extractInterceptionRouteInformation('/(..)bar')
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid interception route: /(..)bar. Cannot use (..) marker at the root level, use (.) instead."`
      )
      expect(() =>
        extractInterceptionRouteInformation('/(..)(..)bar')
      ).toThrowErrorMatchingInlineSnapshot(
        `"Invalid interception route: /(..)(..)bar. Cannot use (..)(..) marker at the root level or one level up."`
      )
    })
  })
})
