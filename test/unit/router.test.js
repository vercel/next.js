/* global describe, it, expect */
import Router from '../../dist/lib/router/router'

describe('Router', () => {
  describe('.prefetch()', () => {
    it('should prefetch a given page', async () => {
      const router = new Router('/', {})
      const promise = Promise.resolve()
      const route = 'routex'
      router.doFetchRoute = (r) => {
        expect(r).toBe(route)
        return promise
      }
      await router.prefetch(route)

      expect(router.fetchingRoutes[route]).toBe(promise)
    })

    it('should stop if it\'s prefetching already', async () => {
      const router = new Router('/', {})
      const route = 'routex'
      router.fetchingRoutes[route] = Promise.resolve()
      router.doFetchRoute = () => { throw new Error('Should not happen') }
      await router.prefetch(route)
    })

    it('should only run two jobs at a time', async () => {
      const router = new Router('/', {})
      let count = 0

      router.doFetchRoute = () => {
        count++
        return new Promise((resolve) => {})
      }

      router.prefetch('route1')
      router.prefetch('route2')
      router.prefetch('route3')
      router.prefetch('route4')

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(count).toBe(2)
      expect(Object.keys(router.fetchingRoutes)).toEqual(['route1', 'route2'])
    })

    it('should run all the jobs', async () => {
      const router = new Router('/', {})
      const routes = ['route1', 'route2', 'route3', 'route4']

      router.doFetchRoute = () => Promise.resolve()

      await router.prefetch(routes[0])
      await router.prefetch(routes[1])
      await router.prefetch(routes[2])
      await router.prefetch(routes[3])

      expect(Object.keys(router.fetchingRoutes)).toEqual(routes)
    })
  })
})
