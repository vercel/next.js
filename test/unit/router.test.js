/* eslint-env jest */
import Router from 'next-server/dist/lib/router/router'
process.env.NODE_ENV = 'production'

class PageLoader {
  constructor (options = {}) {
    this.options = options
    this.loaded = {}
    this.prefetched = {}
  }

  loadPage (route) {
    this.loaded[route] = true

    if (this.options.delay) {
      return new Promise((resolve) => setTimeout(resolve, this.options.delay))
    }
  }

  async prefetch (route) {
    this.prefetched[route] = true
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

      expect(pageLoader.prefetched['/routex']).toBeTruthy()
    })

    it('should call prefetch correctly', async () => {
      global.__NEXT_DATA__ = {}
      // delay loading pages for an hour
      const pageLoader = new PageLoader({ delay: 1000 * 3600 })
      const router = new Router('/', {}, '/', { pageLoader })

      router.prefetch('route1')
      router.prefetch('route2')
      router.prefetch('route3')
      router.prefetch('route4')

      expect(Object.keys(pageLoader.prefetched).length).toBe(4)
      expect(Object.keys(pageLoader.prefetched)).toEqual(['route1', 'route2', 'route3', 'route4'])
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

      expect(Object.keys(pageLoader.prefetched)).toEqual(routes)
    })
  })
})
