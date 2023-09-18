import { AppPageRouteDefinitionBuilder } from './app-page-route-definition-builder'

describe('AppPageRouteDefinitionBuilder', () => {
  it('sorts the app paths correctly', () => {
    const builder = new AppPageRouteDefinitionBuilder()

    // Added out of sort order here to test that the builder will sort them
    // when it returns the definition.
    builder.add({
      page: '/p/[...slug]/page',
      filename: 'app/p/[...slug]/page.js',
    })
    builder.add({
      page: '/p/@slot/foo/page',
      filename: 'app/p/@slot/foo/page.js',
    })
    builder.add({
      page: '/p/foo/page',
      filename: 'app/p/foo/page.js',
    })
    builder.add({
      page: '/p/@slot/[...slug]/page',
      filename: 'app/p/@slot/[...slug]/page.js',
    })

    expect(builder.build()).toMatchInlineSnapshot(`
      Array [
        Object {
          "appPaths": Array [
            "/p/@slot/[...slug]/page",
            "/p/[...slug]/page",
          ],
          "bundlePath": "app/p/[...slug]/page",
          "filename": "app/p/[...slug]/page.js",
          "identity": "/p/[...slug]",
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
          "identity": "/p/foo",
          "kind": "APP_PAGE",
          "page": "/p/foo/page",
          "pathname": "/p/foo",
        },
      ]
    `)
  })
})
