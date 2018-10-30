/* eslint-env jest */
import Router from 'next-server/dist/lib/router/router'

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
  beforeEach(() => {
    global.__NEXT_DATA__ = {}
    global.window = {
      addEventListener: () => {},
      history: {
        replaceState: () => {},
        pushState: () => {}
      },
      location: {
        href: '',
        hash: ''
      }
    }
  })

  describe('.change()', () => {
    let pageLoader
    let router

    beforeEach(() => {
      pageLoader = new PageLoader()
      router = new Router('/', {}, '/', { pageLoader })
      router.fetchComponent = jest.fn(() => () => {})
      router.getInitialProps = jest.fn(() => ({}))
      router.scrollToHash = jest.fn()
      router.changeState = jest.fn()
      Router.events = { emit: jest.fn() }
    })

    it('should cancel component load if call is defined', async () => {
      let cancelled = false
      router.componentLoadCancel = () => { cancelled = true }
      const result = await router.change('pushState', '/test', '/test', {})
      expect(cancelled).toBeTruthy()
      expect(result).toBeTruthy()
    })
    it('should routeChange properly', async () => {
      const result = await router.change('pushState', '/test', '/test', {})
      expect(result).toBeTruthy()
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeStart', '/test')
      expect(Router.events.emit).toHaveBeenCalledWith('beforeHistoryChange', '/test')
      expect(Router.events.emit).not.toHaveBeenCalledWith('routeChangeError', '/test')
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeComplete', '/test')
    })
    it('should perform hashChange instead of routeChange for hash route on same path', async () => {
      const result = await router.change('pushState', '/', '/#test', {})
      expect(result).toBeTruthy()
      expect(router.scrollToHash).toHaveBeenCalledWith('/#test')
      expect(router.fetchComponent).not.toHaveBeenCalled()
      expect(Router.events.emit).toHaveBeenCalledWith('hashChangeStart', '/#test')
      expect(router.changeState).toHaveBeenCalledWith('pushState', '/', '/#test')
      expect(Router.events.emit).toHaveBeenCalledWith('hashChangeComplete', '/#test')
    })
    it('should perform hashChange when navigating back from hash on same path', async () => {
      await router.change('pushState', '/', '/#test', {})
      const result = await router.change('replaceState', '/', '/', {})
      expect(result).toBeTruthy()
      expect(router.scrollToHash).toHaveBeenCalledWith('/')
      expect(router.fetchComponent).not.toHaveBeenCalled()
      expect(Router.events.emit).toHaveBeenCalledWith('hashChangeStart', '/')
      expect(router.changeState).toHaveBeenCalledWith('replaceState', '/', '/')
      expect(Router.events.emit).toHaveBeenCalledWith('hashChangeComplete', '/')
    })
    it('should perform routeChange when navigating to hash route across paths', async () => {
      await router.change('pushState', '/', '/test#test', {})
      const result = await router.change('pushState', '/', '/', {})
      expect(result).toBeTruthy()
      // @todo scrollToHash should be called for all hash requests
      // expect(router.scrollToHash).toHaveBeenCalledWith('/test#test')
      expect(router.fetchComponent).toHaveBeenCalled()
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeStart', '/test#test')
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeComplete', '/test#test')
      expect(router.changeState).toHaveBeenCalledWith('pushState', '/', '/test#test', {})
    })
    it('should override method with replaceState if url is not new', async () => {
      await router.change('pushState', '/', '/', {})
      expect(router.changeState).toHaveBeenCalledWith('replaceState', '/', '/', {})
    })
    it('should not override method with replaceState if url is new', async () => {
      await router.change('pushState', '/', '/#test', {})
      expect(router.changeState).toHaveBeenCalledWith('pushState', '/', '/#test')
      await router.change('pushState', '/', '/test', {})
      expect(router.changeState).toHaveBeenCalledWith('pushState', '/', '/test', {})
    })
    it('should call getInitialProps if not a shallow route', async () => {
      await router.change('pushState', '/', '/', {})
      expect(router.getInitialProps).toHaveBeenCalled()
    })
    it('should call getInitialProps if shallow routing not possible', async () => {
      await router.change('pushState', '/test', '/test', { shallow: true })
      expect(router.getInitialProps).toHaveBeenCalled()
    })
    it('should not call getInitialProps if shallow enabled and possible', async () => {
      await router.change('pushState', '/', '/', { shallow: true })
      expect(router.getInitialProps).toHaveBeenCalled()
    })
    it('should not complete routeChange if routing was canceled', async () => {
      router.getRouteInfo = jest.fn(() => ({error: {cancelled: true}}))
      const result = await router.change('pushState', '/', '/', {})
      expect(result).toBeFalsy()
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeStart', '/')
      expect(Router.events.emit).not.toHaveBeenCalledWith('routeChangeComplete', '/')
    })
    it('should emit routeChangeError if an error occurred', async () => {
      router.getRouteInfo = jest.fn(() => ({error: {cancelled: false}}))
      let result
      try {
        result = await router.change('pushState', '/', '/', {})
      } catch (e) {}
      expect(result).toBeFalsy()
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeStart', '/')
      expect(Router.events.emit).not.toHaveBeenCalledWith('routeChangeComplete', '/')
      expect(Router.events.emit).toHaveBeenCalledWith('routeChangeError', router.getRouteInfo().error, '/')
    })
  })

  describe('.prefetch()', () => {
    const request = { clone: () => null }

    it('should prefetch a given page', async () => {
      const pageLoader = new PageLoader()
      const router = new Router('/', {}, '/', { pageLoader })
      const route = '/routex'
      await router.prefetch(route)

      expect(pageLoader.loaded['/routex']).toBeTruthy()
    })

    it('should only run two jobs at a time', async () => {
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
