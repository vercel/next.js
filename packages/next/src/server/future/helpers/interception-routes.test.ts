import {
  extractInterceptionRouteInformation,
  isIntersectionRouteAppPath,
} from './interception-routes'

describe('Interception Route helper', () => {
  describe('isIntersectionRouteAppPath', () => {
    it('should validate correct paths', () => {
      expect(isIntersectionRouteAppPath('/foo/(..)/bar')).toBe(true)
      expect(isIntersectionRouteAppPath('/foo/(...)/bar')).toBe(true)
      expect(isIntersectionRouteAppPath('/foo/(..)(..)/bar')).toBe(true)
    })
    it('should not validate incorrect paths', () => {
      expect(isIntersectionRouteAppPath('/foo/(..')).toBe(false)
      expect(isIntersectionRouteAppPath('/foo/..)/bar')).toBe(false)
      expect(isIntersectionRouteAppPath('/foo')).toBe(false)
    })
  })
  describe('extractInterceptionRouteInformation', () => {
    it('should extract correct information', () => {
      expect(extractInterceptionRouteInformation('/foo/(..)bar')).toEqual([
        '/foo',
        '/bar',
      ])

      expect(extractInterceptionRouteInformation('/foo/(...)bar')).toEqual([
        '/foo',
        '/bar',
      ])

      expect(
        extractInterceptionRouteInformation('/foo/bar/(..)(..)baz')
      ).toEqual(['/foo/bar', '/baz'])

      expect(
        extractInterceptionRouteInformation('/foo/(group)/bar/(..)(..)baz')
      ).toEqual(['/foo/bar', '/baz'])

      expect(
        extractInterceptionRouteInformation('/foo/bar/@modal/(..)(..)baz')
      ).toEqual(['/foo/bar', '/baz'])
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
  })
})
