/* global describe, it, expect */
import Router from '../../dist/lib/router/router'

class PageLoader {
  constructor (options = {}) {
    this.options = options
    this.loaded = {}
  }

  loadPage (route) {
    this.loaded[route] = true

    if (this.options.delay) {
      return new Promise((resolve) => setTimeout(resolve, this.options.delay))
    }
  }
}

describe('Router', () => {
  const request = { clone: () => null }
  describe('.prefetch()', () => {
    it('should prefetch a given page', async () => {
      global.__NEXT_DATA__ = {}
      const pageLoader = new PageLoader()
      const router = new Router('/', {}, '/', { pageLoader })
      const route = '/routex'
      await router.prefetch(route)

      expect(pageLoader.loaded['/routex']).toBeTruthy()
    })

    it('should only run two jobs at a time', async () => {
      global.__NEXT_DATA__ = {}
      // delay loading pages for an hour
      const pageLoader = new PageLoader({ delay: 1000 * 3600 })
      const router = new Router('/', {}, '/', { pageLoader })

      router.prefetch('route1')
      router.prefetch('route2')
      router.prefetch('route3')
      router.prefetch('route4')

      // Wait for a bit
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(Object.keys(pageLoader.loaded).length).toBe(2)
      expect(Object.keys(pageLoader.loaded)).toEqual(['route1', 'route2'])
    })

    it('should run all the jobs', async () => {
      global.__NEXT_DATA__ = {}
      const pageLoader = new PageLoader()
      const router = new Router('/', {}, '/', { pageLoader })
      const routes = ['route1', 'route2', 'route3', 'route4']

      router.doFetchRoute = () => Promise.resolve(request)

      await router.prefetch(routes[0])
      await router.prefetch(routes[1])
      await router.prefetch(routes[2])
      await router.prefetch(routes[3])

      expect(Object.keys(pageLoader.loaded)).toEqual(routes)
    })
  })
})
