import {
  extractInterceptionRouteInformation,
  findMissingCanonicalInterceptionRoutes,
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

  describe('findMissingCanonicalInterceptionRoutes', () => {
    function isCovered(
      interceptionRoute: string,
      ordinaryRoutes: string[]
    ): boolean {
      return (
        findMissingCanonicalInterceptionRoutes(
          Object.fromEntries(
            [interceptionRoute, ...ordinaryRoutes].map((route) => [
              route,
              [`${route}/page`],
            ])
          )
        ).length === 0
      )
    }

    it.each([
      {
        name: 'an equivalent dynamic matcher',
        interception: '/(.)photo/[id]',
        ordinary: ['/photo/[slug]'],
      },
      {
        name: 'a broader root catchall',
        interception: '/(.)showcase/[...parts]',
        ordinary: ['/[...slug]'],
      },
      {
        name: 'a fixed matcher followed by a deeper catchall',
        interception: '/(.)items/[...parts]',
        ordinary: ['/items/[id]', '/items/[id]/[...rest]'],
      },
      {
        name: 'a fixed matcher and required catchall for an optional catchall',
        interception: '/(.)items/[[...parts]]',
        ordinary: ['/items', '/items/[...rest]'],
      },
    ])('accepts coverage from $name', ({ interception, ordinary }) => {
      expect(isCovered(interception, ordinary)).toBe(true)
    })

    it.each([
      {
        name: 'no ordinary matcher',
        interception: '/(.)photo/[id]',
        ordinary: [],
      },
      {
        name: 'a single dynamic segment for a required catchall',
        interception: '/(.)items/[...parts]',
        ordinary: ['/items/[id]'],
      },
      {
        name: 'a required catchall for an optional catchall',
        interception: '/(.)items/[[...parts]]',
        ordinary: ['/items/[...rest]'],
      },
      {
        name: 'a finite set of static values for a dynamic segment',
        interception: '/(.)items/[id]',
        ordinary: ['/items/one', '/items/two'],
      },
    ])(
      'rejects incomplete coverage from $name',
      ({ interception, ordinary }) => {
        expect(isCovered(interception, ordinary)).toBe(false)
      }
    )
  })
})
