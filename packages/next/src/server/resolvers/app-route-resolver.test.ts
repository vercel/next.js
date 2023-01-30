import { BaseNextRequest } from '../base-http'
import { AppRouteResolver } from './app-route-resolver'

describe('AppRouteResolver', () => {
  describe('successful resolutions', () => {
    const manifest = {
      '/endpoint/route': 'app/endpoint/route.js',
      '/[tenantID]/endpoint/route': 'app/[tenantID]/endpoint/route.js',
      '/(grouped)/endpoint/nested/route':
        'app/(grouped)/endpoint/nested/route.js',
      '/page': 'app/page.js',
    }

    it.each([
      ['/endpoint', 'app/endpoint/route.js'],
      ['/vercel/endpoint', 'app/[tenantID]/endpoint/route.js'],
      ['/endpoint/nested', 'app/(grouped)/endpoint/nested/route.js'],
    ])("will resolve '%s' to '<root>/server/%s'", (pathname, filename) => {
      const module = {}
      const loader = {
        load: jest.fn().mockReturnValue(module),
      }

      const resolver = new AppRouteResolver(
        '<root>',
        manifest,
        undefined,
        loader
      )

      const route = resolver.resolve({
        url: `http://n${pathname}`,
      } as BaseNextRequest)

      expect(route).not.toBeNull()
      expect(loader.load).toBeCalledWith(`<root>/server/${filename}`)
      expect(route?.module).toBe(module)
    })
  })
})
