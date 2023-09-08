import { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import { AppRouteDefinitionBuilder } from './app-route-definition-builder'

describe('AppRouteDefinitionBuilder', () => {
  describe('manifest', () => {
    it('should return an empty builder when the manifest is empty', () => {
      const manifest = {}
      const builder = AppRouteDefinitionBuilder.fromManifest(manifest)
      expect(builder.toManifest()).toEqual(manifest)
    })

    it('should return a builder with the manifest entries', () => {
      const manifest = {
        '/not-found': 'app/not-found.js',
        '/_not-found': 'app/_not-found.js',
        '/robots.txt/route': 'app/robots.txt/route.js',
        '/manifest.webmanifest/route': 'app/manifest.webmanifest/route.js',
        '/sitemap.xml/route': 'app/sitemap.xml/route.js',
        '/apple-icon/route': 'app/apple-icon/route.js',
        '/opengraph-image/route': 'app/opengraph-image/route.js',
        '/icon/route': 'app/icon/route.js',
        '/page': 'app/page.js',
        '/twitter-image/route': 'app/twitter-image/route.js',
        '/gsp/page': 'app/gsp/page.js',
        '/font/page': 'app/font/page.js',
      }
      const builder = AppRouteDefinitionBuilder.fromManifest(manifest)
      expect(builder.toManifest()).toEqual(manifest)
    })

    it('should throw an error when it encounters an invalid entry', () => {
      const manifest = {
        '/robots.txt/route': 'app/robots.txt/route.js',
        '/manifest.webmanifest/route': 'app/manifest.webmanifest/route.js',
        '/sitemap.xml/route': 'app/sitemap.xml/route.js',
        '/apple-icon/route': 'app/apple-icon/route.js',
        '/opengraph-image/route': 'app/opengraph-image/route.js',
        // This is invalid
        '/icon/not-valid': 'app/icon/route.js',
        '/page': 'app/page.js',
        '/twitter-image/route': 'app/twitter-image/route.js',
        '/gsp/page': 'app/gsp/page.js',
        '/font/page': 'app/font/page.js',
      }

      expect(() =>
        AppRouteDefinitionBuilder.fromManifest(manifest)
      ).toThrowErrorMatchingInlineSnapshot(
        `"Unknown route type: /icon/not-valid"`
      )
    })

    it('should produce a manifest that can be read by the builder', () => {
      const builder = new AppRouteDefinitionBuilder()
      builder.add('/page', 'app/page.js')
      builder.add('/gsp/page', 'app/gsp/page.js')

      expect(builder.toManifest()).toMatchInlineSnapshot(`
        Object {
          "/gsp/page": "app/gsp/page.js",
          "/page": "app/page.js",
        }
      `)
    })
  })

  describe('pathnames', () => {
    it('returns the pathnames sorted', () => {
      const builder = new AppRouteDefinitionBuilder()
      builder.add('/page', 'app/page.js')
      builder.add('/gsp/page', 'app/gsp/page.js')

      expect(builder.pathnames()).toEqual(['/', '/gsp'])

      builder.add('/font/page', 'app/font/page.js')

      expect(builder.pathnames()).toEqual(['/', '/font', '/gsp'])

      builder.add('/help/page', 'app/help/page.js')

      expect(builder.pathnames()).toEqual(['/', '/font', '/gsp', '/help'])
    })
  })

  describe('get', () => {
    it('should return undefined when the page is not defined', () => {
      const builder = new AppRouteDefinitionBuilder()

      expect(builder.get('/')).toBeNull()
    })

    it('should return the definition when the page is defined', () => {
      const builder = new AppRouteDefinitionBuilder()
      builder.add('/page', 'app/page.js')

      expect(builder.get('/')).toMatchInlineSnapshot(`
        Object {
          "appPaths": Array [
            "/page",
          ],
          "bundlePath": "app/page",
          "filename": "app/page.js",
          "kind": "APP_PAGE",
          "page": "/page",
          "pathname": "/",
        }
      `)
    })

    it('should return the definition with multiple app paths', () => {
      const builder = AppRouteDefinitionBuilder.fromManifest({
        '/dashboard/@team/(team)/page': 'app/dashboard/@team/(team)/page.js',
        '/dashboard/@account/page': 'app/dashboard/@account/page.js',
      })

      expect(builder.toSortedDefinitions()).toMatchInlineSnapshot(`
        Array [
          Object {
            "appPaths": Array [
              "/dashboard/@account/page",
              "/dashboard/@team/(team)/page",
            ],
            "bundlePath": "app/dashboard/@team/(team)/page",
            "filename": "app/dashboard/@team/(team)/page.js",
            "kind": "APP_PAGE",
            "page": "/dashboard/@team/(team)/page",
            "pathname": "/dashboard",
          },
        ]
      `)
    })
  })

  describe('add', () => {
    it('should sort the app paths', () => {
      const builder = new AppRouteDefinitionBuilder()

      // Added out of sort order here to test that the builder will sort them
      // when it returns the definition.
      builder.add('/p/@slot/[...slug]/page', 'app/p/@slot/[...slug]/page.js')
      builder.add('/p/[...slug]/page', 'app/p/[...slug]/page.js')
      builder.add('/p/foo/page', 'app/p/foo/page.js')
      builder.add('/p/@slot/foo/page', 'app/p/@slot/foo/page.js')

      expect(builder.get('/p/[...slug]')).toMatchInlineSnapshot(`
        Object {
          "appPaths": Array [
            "/p/@slot/[...slug]/page",
            "/p/[...slug]/page",
          ],
          "bundlePath": "app/p/[...slug]/page",
          "filename": "app/p/[...slug]/page.js",
          "kind": "APP_PAGE",
          "page": "/p/[...slug]/page",
          "pathname": "/p/[...slug]",
        }
      `)
      expect(builder.get('/p/foo')).toMatchInlineSnapshot(`
        Object {
          "appPaths": Array [
            "/p/@slot/foo/page",
            "/p/foo/page",
          ],
          "bundlePath": "app/p/foo/page",
          "filename": "app/p/foo/page.js",
          "kind": "APP_PAGE",
          "page": "/p/foo/page",
          "pathname": "/p/foo",
        }
      `)
    })

    it('should use the last app path as the page', () => {
      const builder = new AppRouteDefinitionBuilder()
      builder.add('/p/[...slug]/page', 'app/p/[...slug]/page.js')
      builder.add('/p/@slot/[...slug]/page', 'app/p/@slot/[...slug]/page.js')

      const definition = builder.get('/p/[...slug]') as AppPageRouteDefinition

      expect(definition?.pathname).toEqual('/p/[...slug]')
      expect(definition?.page).toEqual('/p/[...slug]/page')
      expect(definition).toMatchInlineSnapshot(`
        Object {
          "appPaths": Array [
            "/p/@slot/[...slug]/page",
            "/p/[...slug]/page",
          ],
          "bundlePath": "app/p/[...slug]/page",
          "filename": "app/p/[...slug]/page.js",
          "kind": "APP_PAGE",
          "page": "/p/[...slug]/page",
          "pathname": "/p/[...slug]",
        }
      `)
    })
  })

  describe('toSortedDefinitions', () => {
    it('should return an empty array when there are no definitions', () => {
      const builder = new AppRouteDefinitionBuilder()

      expect(builder.toSortedDefinitions()).toEqual([])
    })

    it('should return the definitions sorted by pathname', () => {
      const builder = new AppRouteDefinitionBuilder()
      builder.add('/p/@slot/[...slug]/page', 'app/p/@slot/[...slug]/page.js')
      builder.add('/p/[...slug]/page', 'app/p/[...slug]/page.js')
      builder.add('/p/foo/page', 'app/p/foo/page.js')
      builder.add('/p/@slot/foo/page', 'app/p/@slot/foo/page.js')

      expect(builder.toSortedDefinitions()).toMatchInlineSnapshot(`
        Array [
          Object {
            "appPaths": Array [
              "/p/@slot/[...slug]/page",
              "/p/[...slug]/page",
            ],
            "bundlePath": "app/p/[...slug]/page",
            "filename": "app/p/[...slug]/page.js",
            "kind": "APP_PAGE",
            "page": "/p/[...slug]/page",
            "pathname": "/p/[...slug]",
          },
          Object {
            "appPaths": Array [
              "/p/@slot/foo/page",
              "/p/foo/page",
            ],
            "bundlePath": "app/p/foo/page",
            "filename": "app/p/foo/page.js",
            "kind": "APP_PAGE",
            "page": "/p/foo/page",
            "pathname": "/p/foo",
          },
        ]
      `)
    })
  })
})
