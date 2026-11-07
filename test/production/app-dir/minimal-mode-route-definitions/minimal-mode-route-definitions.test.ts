import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

// The fixture starts a `NextServer` in minimal mode itself. A deployment
// would put the platform's own router and server in front of the app.
// @force-gate !deploy
describe('minimal-mode-route-definitions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node minimal-server.js',
    serverReadyPattern: /Minimal server ready/,
    forcedPort: 'random',
  })

  async function fetchMatched(pathname: string, matchedPath = pathname) {
    const res = await next.fetch(pathname, {
      headers: { 'x-matched-path': matchedPath },
    })

    return { status: res.status, body: await res.text() }
  }

  async function fetchPage(pathname: string, matchedPath = pathname) {
    const { status, body } = await fetchMatched(pathname, matchedPath)

    return { status, route: load(body)('#route').first().text() }
  }

  async function replaceAppPathRoutes(without?: string) {
    const query = without ? `?without=${encodeURIComponent(without)}` : ''
    const res = await next.fetch(`/_test/app-path-routes${query}`)
    expect(res.status).toBe(200)
  }

  // The server keeps its route definitions between requests, so every kind of
  // route is requested more than once and with different params.
  it.each(['first', 'second'])(
    'matches every kind of route for the %s request',
    async (id) => {
      // A dynamic route is selected by its pattern, as a platform router
      // sends it, and by a concrete pathname.
      for (const matchedPath of ['/api/items/[id]', `/api/items/${id}`]) {
        const appRoute = await fetchMatched(`/api/items/${id}`, matchedPath)
        expect(appRoute.status).toBe(200)
        expect(JSON.parse(appRoute.body)).toEqual({ route: 'app route', id })
      }

      for (const matchedPath of ['/api/legacy/[id]', `/api/legacy/${id}`]) {
        const pagesApi = await fetchMatched(`/api/legacy/${id}`, matchedPath)
        expect(pagesApi.status).toBe(200)
        expect(JSON.parse(pagesApi.body)).toEqual({ route: 'pages api', id })
      }

      for (const matchedPath of ['/legacy/[id]', `/legacy/${id}`]) {
        expect(await fetchPage(`/legacy/${id}`, matchedPath)).toEqual({
          status: 200,
          route: `pages page ${id}`,
        })
      }

      for (const matchedPath of ['/items/[id]', `/items/${id}`]) {
        expect(await fetchPage(`/items/${id}`, matchedPath)).toEqual({
          status: 200,
          route: `app page ${id}`,
        })
      }

      // A static pathname wins over the dynamic route that also matches it.
      expect(await fetchPage('/items/featured')).toEqual({
        status: 200,
        route: 'featured app page',
      })
    }
  )

  it('follows a replaced appPathRoutes', async () => {
    expect((await fetchPage('/items/featured')).route).toBe('featured app page')

    try {
      // Without the static page, its pathname belongs to `/items/[id]`.
      await replaceAppPathRoutes('/items/featured')
      expect(await fetchPage('/items/featured')).toEqual({
        status: 200,
        route: 'app page featured',
      })

      // Without the dynamic page, the pathname has no route.
      await replaceAppPathRoutes('/items/[id]')
      expect((await fetchPage('/items/first')).status).toBe(404)
    } finally {
      await replaceAppPathRoutes()
    }

    expect(await fetchPage('/items/first')).toEqual({
      status: 200,
      route: 'app page first',
    })
    expect((await fetchPage('/items/featured')).route).toBe('featured app page')
  })
})
