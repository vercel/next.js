import type { BaseNextRequest } from '../base-http'
import { AppRouteRouteMatcher } from './app-route-route-matcher'

describe('AppRouteRouteMatcher', () => {
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
      const resolver = new AppRouteRouteMatcher('<root>', manifest, undefined)

      const route = resolver.match({
        url: `http://n${pathname}`,
      } as BaseNextRequest)

      expect(route).not.toBeNull()
      expect(route?.filename).toEqual(`<root>/server/${filename}`)
    })
  })
})
