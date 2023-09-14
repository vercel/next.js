import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type { RouteDefinitionProvider } from '../../route-definitions/providers/route-definition-provider'

import { AppPageRouteMatcherProvider } from './app-page-route-matcher-provider'
import { AppPageRouteDefinitionBuilder } from '../../route-definitions/builders/app-page-route-definition-builder'
import { RouteKind } from '../../route-kind'

describe('AppPAgeRouteMatcherProvider', () => {
  it('does not provide duplicate matchers for matching app paths', async () => {
    const builder = new AppPageRouteDefinitionBuilder()

    // Added out of sort order here to test that the builder will sort them
    // when it returns the definition.
    builder.add({
      page: '/p/@slot/[...slug]/page',
      filename: 'app/p/@slot/[...slug]/page.js',
    })
    builder.add({
      page: '/p/[...slug]/page',
      filename: 'app/p/[...slug]/page.js',
    })
    builder.add({
      page: '/p/foo/page',
      filename: 'app/p/foo/page.js',
    })
    builder.add({
      page: '/p/@slot/foo/page',
      filename: 'app/p/@slot/foo/page.js',
    })

    const definitions: RouteDefinitionProvider<AppPageRouteDefinition> = {
      kind: RouteKind.APP_PAGE,
      provide: async () => builder.build(),
    }

    const provider = new AppPageRouteMatcherProvider(definitions)

    const matchers = await provider.provide()

    expect(matchers).toMatchInlineSnapshot(`
      Array [
        AppPageRouteMatcher {
          "definition": Object {
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
          "matcher": DynamicPathnameMatcher {
            "matcher": [Function],
            "pathname": "/p/[...slug]",
          },
        },
        AppPageRouteMatcher {
          "definition": Object {
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
          "matcher": StaticPathnameMatcher {
            "pathname": "/p/foo",
          },
        },
      ]
    `)
  })
})
