import { prepareFlightRouterStateForRequest } from './flight-data-helpers'
import {
  HasLoadingBoundary,
  type FlightRouterState,
} from '../shared/lib/app-router-types'

describe('prepareFlightRouterStateForRequest', () => {
  describe('HMR refresh handling', () => {
    it('should preserve complete state for HMR refresh requests', () => {
      const flightRouterState: FlightRouterState = [
        '__PAGE__?{"sensitive":"data"}',
        {},
        '/some/url',
        'refresh',
        true,
        1,
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState, true)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded).toEqual(flightRouterState)
    })
  })

  describe('__PAGE__ segment handling', () => {
    it('should strip search params from __PAGE__ segments', () => {
      const flightRouterState: FlightRouterState = [
        '__PAGE__?{"param":"value","foo":"bar"}',
        {},
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[0]).toBe('__PAGE__')
    })

    it('should preserve non-page segments', () => {
      const flightRouterState: FlightRouterState = ['regular-segment', {}]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[0]).toBe('regular-segment')
    })

    it('should preserve dynamic segments', () => {
      const dynamicSegment: [string, string, 'd'] = ['slug', 'test-value', 'd']
      const flightRouterState: FlightRouterState = [dynamicSegment, {}]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[0]).toEqual(dynamicSegment)
    })
  })

  describe('URL stripping', () => {
    it('should always set URL (index 2) to null', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        '/sensitive/url/path',
        null,
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[2]).toBeNull()
    })
  })

  describe('refresh marker handling', () => {
    it('should preserve "refetch" marker', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        '/url',
        'refetch',
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[3]).toBe('refetch')
    })

    it('should preserve "inside-shared-layout" marker', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        '/url',
        'inside-shared-layout',
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[3]).toBe('inside-shared-layout')
    })

    it('should strip "refresh" marker (client-only)', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        '/url',
        'refresh',
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[3]).toBeNull()
    })

    it('should strip null refresh marker', () => {
      const flightRouterState: FlightRouterState = ['segment', {}, '/url', null]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[3]).toBeNull()
    })
  })

  describe('optional fields preservation', () => {
    it('should preserve isRootLayout when true', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        null,
        null,
        true,
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[4]).toBe(true)
    })

    it('should preserve isRootLayout when false', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        null,
        null,
        false,
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[4]).toBe(false)
    })

    it('should preserve hasLoadingBoundary', () => {
      const flightRouterState: FlightRouterState = [
        'segment',
        {},
        null,
        null,
        undefined,
        1, // HasLoadingBoundary value
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[5]).toBe(1)
    })

    it('should handle minimal FlightRouterState (only segment and parallelRoutes)', () => {
      const flightRouterState: FlightRouterState = ['segment', {}]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded).toEqual([
        'segment',
        {},
        null, // URL
        null, // refresh marker
      ])
    })
  })

  describe('recursive processing of parallel routes', () => {
    it('should recursively process nested parallel routes', () => {
      const flightRouterState: FlightRouterState = [
        'parent',
        {
          children: [
            '__PAGE__?{"nested":"param"}',
            {},
            '/nested/url',
            'refresh',
          ],
          modal: ['modal-segment', {}, '/modal/url', 'refetch'],
        },
        '/parent/url',
        'inside-shared-layout',
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded).toEqual([
        'parent',
        {
          children: [
            '__PAGE__', // search params stripped
            {},
            null, // URL stripped
            null, // 'refresh' marker stripped
          ],
          modal: [
            'modal-segment',
            {},
            null, // URL stripped
            'refetch', // server marker preserved
          ],
        },
        null, // URL stripped
        'inside-shared-layout', // server marker preserved
      ])
    })

    it('should handle deeply nested parallel routes', () => {
      const flightRouterState: FlightRouterState = [
        'root',
        {
          children: [
            'level1',
            {
              children: [
                '__PAGE__?{"deep":"nesting"}',
                {},
                '/deep/url',
                'refetch',
              ],
            },
          ],
        },
      ]

      const result = prepareFlightRouterStateForRequest(flightRouterState)
      const decoded = JSON.parse(decodeURIComponent(result))

      expect(decoded[1].children[1].children[0]).toBe('__PAGE__')
      expect(decoded[1].children[1].children[2]).toBeNull()
      expect(decoded[1].children[1].children[3]).toBe('refetch')
    })
  })

  describe('real-world scenarios', () => {
    it('should handle complex FlightRouterState with all features', () => {
      const complexState: FlightRouterState = [
        '__PAGE__?{"userId":"123"}',
        {
          children: [
            'dashboard',
            {
              modal: [
                '__PAGE__?{"modalParam":"data"}',
                {},
                '/modal/path',
                'refresh',
                false,
                HasLoadingBoundary.SegmentHasLoadingBoundary,
              ],
            },
            '/dashboard/url',
            'refetch',
            true,
            1,
          ],
          sidebar: [['slug', 'user-123', 'd'], {}, '/sidebar/url', null],
        },
        '/main/url',
        'inside-shared-layout',
        true,
        1,
      ]

      const result = prepareFlightRouterStateForRequest(complexState)
      const decoded = JSON.parse(decodeURIComponent(result))

      // Root level checks
      expect(decoded[0]).toBe('__PAGE__') // search params stripped
      expect(decoded[2]).toBeNull() // URL stripped
      expect(decoded[3]).toBe('inside-shared-layout') // server marker preserved
      expect(decoded[4]).toBe(true) // isRootLayout preserved
      expect(decoded[5]).toBe(1) // hasLoadingBoundary preserved

      // Children route checks
      const childrenRoute = decoded[1].children
      expect(childrenRoute[2]).toBeNull() // URL stripped
      expect(childrenRoute[3]).toBe('refetch') // server marker preserved
      expect(childrenRoute[4]).toBe(true) // isRootLayout preserved

      // Modal route checks
      const modalRoute = childrenRoute[1].modal
      expect(modalRoute[0]).toBe('__PAGE__') // search params stripped
      expect(modalRoute[2]).toBeNull() // URL stripped
      expect(modalRoute[3]).toBeNull() // 'refresh' marker stripped
      expect(modalRoute[4]).toBe(false) // isRootLayout preserved
      expect(modalRoute[5]).toBe(HasLoadingBoundary.SegmentHasLoadingBoundary) // hasLoadingBoundary preserved

      // Sidebar route (dynamic segment) checks
      const sidebarRoute = decoded[1].sidebar
      expect(sidebarRoute[0]).toEqual(['slug', 'user-123', 'd']) // dynamic segment preserved
      expect(sidebarRoute[2]).toBeNull() // URL stripped
      expect(sidebarRoute[3]).toBeNull() // null marker remains null
    })
  })
})
