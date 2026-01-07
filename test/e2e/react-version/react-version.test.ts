import { nextTestSetup } from 'e2e-utils'

describe('react version', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use react-server condition for app router server components pages', async () => {
    const rscPagesRoutes = ['/app/server', '/app/server-edge']

    for (const route of rscPagesRoutes) {
      const $ = await next.render$(route)
      expect($('#react-export-condition').text()).toBe('react-server')
      expect($('#react-dom-export-condition').text()).toBe('react-server')
    }
  })

  it('should use react-server condition for app router client components pages', async () => {
    const rscPagesRoutes = ['/app/client', '/app/client-edge']

    for (const route of rscPagesRoutes) {
      const $ = await next.render$(route)
      expect($('#react-export-condition').text()).toBe('default')
      expect($('#react-dom-export-condition').text()).toBe('default')
    }
  })

  it('should use react-server condition for app router custom routes', async () => {
    const customRoutes = ['/app/route', '/app/route-edge']

    for (const route of customRoutes) {
      const res = await next.fetch(route)
      const json = await res.json()
      expect(json.react).toBe('react-server')
      expect(json.reactDom).toBe('react-server')
    }
  })

  it('should use default react condition for pages router pages', async () => {
    const pagesRoutes = ['/pages-ssr', '/pages-ssr-edge']

    for (const route of pagesRoutes) {
      const $ = await next.render$(route)
      expect($('#react-export-condition').text()).toBe('default')
      expect($('#react-dom-export-condition').text()).toBe('default')
    }
  })

  it('should use default react condition for pages router apis', async () => {
    const pagesRoutes = [
      '/api/pages-api',
      '/api/pages-api-edge',
      '/api/pages-api-edge-url-dep',
    ]

    for (const route of pagesRoutes) {
      const res = await next.fetch(route)
      const json = await res.json()
      expect(json.react).toBe('default')
      expect(json.reactDom).toBe('default')
    }
  })
})
