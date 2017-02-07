/* global describe, it, expect */
import Router from '../../dist/lib/router/router'

describe('Router', () => {
  describe('.prefetch()', () => {
    it('should prefetch a given page', async () => {
      const router = new Router('/', {})
      const res = { aa: 'res' }
      const route = 'routex'
      router.fetchUrl = (r) => {
        expect(r).toBe(route)
        return Promise.resolve(res)
      }
      await router.prefetch(route)

      expect(router.prefetchedRoutes[route]).toBe(res)
    })

    it('should stop if it\'s prefetched already', async () => {
      const router = new Router('/', {})
      const route = 'routex'
      router.prefetchedRoutes[route] = { aa: 'res' }
      router.fetchUrl = () => { throw new Error('Should not happen') }
      await router.prefetch(route)
    })

    it('should stop if it\'s currently prefetching', async () => {
      const router = new Router('/', {})
      const route = 'routex'
      router.prefetchingRoutes[route] = true
      router.fetchUrl = () => { throw new Error('Should not happen') }
      await router.prefetch(route)
    })

    it('should ignore the response if it asked to do', async () => {
      const router = new Router('/', {})
      const res = { aa: 'res' }
      const route = 'routex'

      let called = false
      router.fetchUrl = () => {
        called = true
        router.prefetchingRoutes[route] = 'IGNORE'
        return Promise.resolve(res)
      }
      await router.prefetch(route)

      expect(router.prefetchedRoutes[route]).toBeUndefined()
      expect(called).toBe(true)
    })

    it('should only run two jobs at a time', async () => {
      const router = new Router('/', {})
      let count = 0

      router.fetchUrl = () => {
        count++
        return new Promise((resolve) => {})
      }

      router.prefetch('route1')
      router.prefetch('route2')
      router.prefetch('route3')
      router.prefetch('route4')

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(count).toBe(2)
      expect(Object.keys(router.prefetchingRoutes)).toEqual(['route1', 'route2'])
    })

    it('should run all the jobs', async () => {
      const router = new Router('/', {})
      const routes = ['route1', 'route2', 'route3', 'route4']

      router.fetchUrl = () => Promise.resolve({ aa: 'res' })

      await router.prefetch(routes[0])
      await router.prefetch(routes[1])
      await router.prefetch(routes[2])
      await router.prefetch(routes[3])

      expect(Object.keys(router.prefetchedRoutes)).toEqual(routes)
      expect(Object.keys(router.prefetchingRoutes)).toEqual([])
    })
  })
})
